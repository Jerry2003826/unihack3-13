"""SafeOps Execution Framework — anti-hallucination security layer for the ops agent.

Every bash command passes through a policy gate before real execution:

    PROPOSED → CLASSIFIED → DRY_RUN → SELF_VERIFIED → EXECUTING
              → POST_CHECK → COMPLETED / ROLLED_BACK

At any stage a command can be REJECTED with a reason.
"""

from __future__ import annotations

import json
import logging
import re
import subprocess
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Permission Levels
# ---------------------------------------------------------------------------

class PermissionLevel(str, Enum):
    READ_ONLY = "READ_ONLY"
    MODIFY = "MODIFY"
    DANGEROUS = "DANGEROUS"


class CommandState(str, Enum):
    PROPOSED = "PROPOSED"
    CLASSIFIED = "CLASSIFIED"
    DRY_RUN = "DRY_RUN"
    SELF_VERIFIED = "SELF_VERIFIED"
    EXECUTING = "EXECUTING"
    POST_CHECK = "POST_CHECK"
    COMPLETED = "COMPLETED"
    ROLLED_BACK = "ROLLED_BACK"
    REJECTED = "REJECTED"


# ---------------------------------------------------------------------------
# Whitelist / Blacklist
# ---------------------------------------------------------------------------

READ_ONLY_PREFIXES: list[str] = [
    "cat ", "ls", "df ", "free ", "top ", "uptime", "who", "whoami",
    "ps ", "journalctl", "systemctl status", "systemctl is-active",
    "systemctl list-units", "hostnamectl", "uname", "lsb_release",
    "ip addr", "ip route", "ss ", "netstat", "dig ", "ping ",
    "head ", "tail ", "wc ", "grep ", "awk ", "sort ", "du ",
    "stat ", "file ", "date", "timedatectl", "lsblk", "blkid",
    "mount ", "findmnt", "dpkg -l", "apt list", "which ", "type ",
    "echo ", "id ", "groups", "last ", "dmesg", "sysctl ",
]

MODIFY_PREFIXES: list[str] = [
    "systemctl restart", "systemctl start", "systemctl stop",
    "systemctl reload", "systemctl enable", "systemctl disable",
    "apt-get install", "apt-get update", "apt-get upgrade",
    "apt-get autoremove", "apt-get clean", "apt install",
    "ufw allow", "ufw deny", "ufw enable", "ufw delete",
    "fail2ban-client", "mkdir ", "touch ", "cp ", "mv ",
    "chmod ", "chown ", "tee ", "sed -i", "crontab",
    "logrotate", "timedatectl set-timezone",
]

BLACKLIST_PATTERNS: list[str] = [
    r"rm\s+-rf\s+/\s*$",
    r"rm\s+-rf\s+/\*",
    r"dd\s+if=",
    r"mkfs",
    r"shutdown",
    r"reboot",
    r"halt",
    r"init\s+0",
    r"init\s+6",
    r">\s*/dev/sd",
    r"chmod\s+777\s+/\s*$",
    r"chmod\s+-R\s+777\s+/",
    r":(){ :\|:& };:",          # fork bomb
    r"\|\s*mail\s",
    r"curl.*\|\s*bash",
    r"wget.*\|\s*bash",
    r"python.*-c.*import\s+os",
    r"nc\s+-e",
    r"ncat\s+-e",
]

# ---------------------------------------------------------------------------
# Rollback Registry
# ---------------------------------------------------------------------------

ROLLBACK_RULES: list[tuple[str, str]] = [
    (r"systemctl\s+stop\s+(\S+)", r"systemctl start \1"),
    (r"systemctl\s+start\s+(\S+)", r"systemctl stop \1"),
    (r"systemctl\s+restart\s+(\S+)", r"systemctl restart \1"),
    (r"systemctl\s+disable\s+(\S+)", r"systemctl enable \1"),
    (r"systemctl\s+enable\s+(\S+)", r"systemctl disable \1"),
    (r"ufw\s+allow\s+(.+)", r"ufw delete allow \1"),
    (r"ufw\s+deny\s+(.+)", r"ufw delete deny \1"),
    (r"apt-get\s+install\s+-y\s+(\S+)", r"apt-get remove -y \1"),
    (r"apt\s+install\s+-y\s+(\S+)", r"apt remove -y \1"),
]


def derive_rollback(command: str) -> str | None:
    """Try to derive an undo command from the rollback registry."""
    for pattern, replacement in ROLLBACK_RULES:
        match = re.match(pattern, command.strip())
        if match:
            return re.sub(pattern, replacement, command.strip())
    return None


# ---------------------------------------------------------------------------
# Audit Log
# ---------------------------------------------------------------------------

@dataclass(slots=True)
class AuditEntry:
    timestamp: str
    command: str
    permission_level: str
    state: str
    dry_run_description: str | None = None
    verification_decision: str | None = None
    execution_result: str | None = None
    rollback_command: str | None = None
    rollback_result: str | None = None
    rejection_reason: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {k: v for k, v in asdict(self).items() if v is not None}


class AuditLog:
    """Append-only audit trail for all SafeOps operations."""

    def __init__(self, log_path: str | None = None) -> None:
        self.entries: list[AuditEntry] = []
        self._log_path = Path(log_path) if log_path else None

    def record(self, entry: AuditEntry) -> None:
        self.entries.append(entry)
        logger.info("[SafeOps Audit] %s", json.dumps(entry.to_dict()))
        if self._log_path:
            try:
                self._log_path.parent.mkdir(parents=True, exist_ok=True)
                with self._log_path.open("a") as f:
                    f.write(json.dumps(entry.to_dict()) + "\n")
            except OSError:
                logger.warning("Failed to write audit log to %s", self._log_path)


# ---------------------------------------------------------------------------
# Command Classifier
# ---------------------------------------------------------------------------

def classify_command(command: str) -> PermissionLevel:
    """Classify a command into a permission level."""
    stripped = command.strip()

    # Check blacklist first
    for pattern in BLACKLIST_PATTERNS:
        if re.search(pattern, stripped):
            return PermissionLevel.DANGEROUS

    # Check read-only
    for prefix in READ_ONLY_PREFIXES:
        if stripped.startswith(prefix) or stripped == prefix.strip():
            return PermissionLevel.READ_ONLY

    # Check modify
    for prefix in MODIFY_PREFIXES:
        if stripped.startswith(prefix):
            return PermissionLevel.MODIFY

    # Unknown commands default to DANGEROUS
    return PermissionLevel.DANGEROUS


def generate_dry_run_description(command: str) -> str:
    """Generate a human-readable description of what this command will do."""
    stripped = command.strip()

    if stripped.startswith("systemctl restart"):
        service = stripped.split()[-1] if len(stripped.split()) > 2 else "unknown"
        return f"Will stop and restart the '{service}' service. Brief downtime expected."

    if stripped.startswith("systemctl stop"):
        service = stripped.split()[-1] if len(stripped.split()) > 2 else "unknown"
        return f"Will stop the '{service}' service. It will remain stopped until manually started."

    if stripped.startswith("systemctl start"):
        service = stripped.split()[-1] if len(stripped.split()) > 2 else "unknown"
        return f"Will start the '{service}' service."

    if stripped.startswith(("apt-get install", "apt install")):
        packages = " ".join(stripped.split()[2:])
        return f"Will install packages: {packages}. May download and configure new software."

    if stripped.startswith("ufw allow"):
        rule = stripped[len("ufw allow"):].strip()
        return f"Will open firewall port/rule: {rule}."

    if stripped.startswith("ufw deny"):
        rule = stripped[len("ufw deny"):].strip()
        return f"Will block firewall port/rule: {rule}."

    if stripped.startswith("fail2ban-client"):
        return f"Will interact with fail2ban: {stripped}."

    if stripped.startswith("sed -i"):
        return f"Will edit file(s) in-place: {stripped}."

    return f"Will execute: {stripped}"


# ---------------------------------------------------------------------------
# SafeOps Gate (State Machine)
# ---------------------------------------------------------------------------

@dataclass(slots=True)
class SafeOpsResult:
    """Result of running a command through the SafeOps gate."""
    command: str
    allowed: bool
    output: str
    state: CommandState
    audit_entry: AuditEntry
    needs_verification: bool = False
    dry_run_description: str | None = None


class SafeOpsGate:
    """Central policy gate that every command passes through."""

    def __init__(self, audit_log: AuditLog | None = None) -> None:
        self.audit = audit_log or AuditLog()

    def evaluate(self, command: str) -> SafeOpsResult:
        """Evaluate a command through the full SafeOps pipeline.

        For READ_ONLY commands: execute immediately.
        For MODIFY commands: return needs_verification=True with dry-run info.
        For DANGEROUS commands: reject immediately.
        """
        now = datetime.now(timezone.utc).isoformat()
        level = classify_command(command)

        # --- DANGEROUS: instant rejection ---
        if level == PermissionLevel.DANGEROUS:
            entry = AuditEntry(
                timestamp=now,
                command=command,
                permission_level=level.value,
                state=CommandState.REJECTED.value,
                rejection_reason=f"Command classified as {level.value}. "
                "Matches blacklist or is an unknown/unrecognized command. "
                "Execution blocked for safety.",
            )
            self.audit.record(entry)
            return SafeOpsResult(
                command=command,
                allowed=False,
                output=f"[SafeOps BLOCKED] {entry.rejection_reason}",
                state=CommandState.REJECTED,
                audit_entry=entry,
            )

        # --- READ_ONLY: execute immediately ---
        if level == PermissionLevel.READ_ONLY:
            result = self._execute(command)
            entry = AuditEntry(
                timestamp=now,
                command=command,
                permission_level=level.value,
                state=CommandState.COMPLETED.value,
                execution_result=result[:500],
            )
            self.audit.record(entry)
            return SafeOpsResult(
                command=command,
                allowed=True,
                output=result,
                state=CommandState.COMPLETED,
                audit_entry=entry,
            )

        # --- MODIFY: requires verification ---
        dry_run = generate_dry_run_description(command)
        rollback = derive_rollback(command)
        entry = AuditEntry(
            timestamp=now,
            command=command,
            permission_level=level.value,
            state=CommandState.DRY_RUN.value,
            dry_run_description=dry_run,
            rollback_command=rollback,
        )
        self.audit.record(entry)
        return SafeOpsResult(
            command=command,
            allowed=False,  # not yet — needs verification
            output=dry_run,
            state=CommandState.DRY_RUN,
            audit_entry=entry,
            needs_verification=True,
            dry_run_description=dry_run,
        )

    def execute_verified(self, command: str, verification: str = "YES") -> SafeOpsResult:
        """Execute a command that has been verified by the LLM."""
        now = datetime.now(timezone.utc).isoformat()
        level = classify_command(command)
        rollback = derive_rollback(command)

        if verification.strip().upper() != "YES":
            entry = AuditEntry(
                timestamp=now,
                command=command,
                permission_level=level.value,
                state=CommandState.REJECTED.value,
                verification_decision=verification,
                rejection_reason="LLM self-verification declined execution.",
            )
            self.audit.record(entry)
            return SafeOpsResult(
                command=command,
                allowed=False,
                output=f"[SafeOps] Execution cancelled by self-verification: {verification}",
                state=CommandState.REJECTED,
                audit_entry=entry,
            )

        # Execute the real command
        result = self._execute(command)

        # Post-check: if exit code is non-zero in result, attempt rollback
        needs_rollback = "[EXIT CODE]:" in result and rollback is not None
        rollback_result = None

        if needs_rollback:
            logger.warning("[SafeOps] Command failed, attempting rollback: %s", rollback)
            rollback_result = self._execute(rollback)

        final_state = CommandState.ROLLED_BACK if needs_rollback else CommandState.COMPLETED

        entry = AuditEntry(
            timestamp=now,
            command=command,
            permission_level=level.value,
            state=final_state.value,
            verification_decision="YES",
            execution_result=result[:500],
            rollback_command=rollback if needs_rollback else None,
            rollback_result=rollback_result[:500] if rollback_result else None,
        )
        self.audit.record(entry)
        return SafeOpsResult(
            command=command,
            allowed=True,
            output=result if not needs_rollback else f"{result}\n[ROLLED BACK]: {rollback_result}",
            state=final_state,
            audit_entry=entry,
        )

    @staticmethod
    def _execute(command: str) -> str:
        """Actually run the command via subprocess."""
        try:
            proc = subprocess.run(
                command,
                shell=True,
                check=False,
                capture_output=True,
                text=True,
                timeout=30,
            )
            output = proc.stdout
            if proc.stderr:
                output += f"\n[STDERR]:\n{proc.stderr}"
            if proc.returncode != 0:
                output += f"\n[EXIT CODE]: {proc.returncode}"
            return output if output.strip() else "Command executed successfully with no output."
        except subprocess.TimeoutExpired:
            return f"Command timed out after 30 seconds: {command}"
        except Exception as e:
            return f"Error executing command: {e}"


# ---------------------------------------------------------------------------
# Verification Prompt Builder
# ---------------------------------------------------------------------------

def build_verification_prompt(command: str, dry_run: str, rollback: str | None) -> str:
    """Build the self-verification prompt to send to the LLM."""
    parts = [
        "[SafeOps Self-Verification Required]",
        f"You are about to execute: `{command}`",
        f"Dry-run analysis: {dry_run}",
    ]
    if rollback:
        parts.append(f"Rollback if failed: `{rollback}`")
    else:
        parts.append("⚠️ No automatic rollback available for this command.")
    parts.append(
        "\nConfirm by responding with ONLY 'YES' to proceed, "
        "or 'NO: <reason>' to abort."
    )
    return "\n".join(parts)

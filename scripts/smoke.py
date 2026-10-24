#!/usr/bin/env python3
"""Model-free POSIX TUI smoke: actual fork idle + explicitly synthetic activity."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import pty
import select
import struct
import subprocess
import tempfile
import termios
import time

parser = argparse.ArgumentParser()
parser.add_argument("--minimal", required=True, type=Path, help="pi-minimal built extension entry")
parser.add_argument("--fork", required=True, type=Path, help="fork built extension entry")
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
host = root / "node_modules/@earendil-works/pi-coding-agent/dist/cli.js"
for source in [host, args.minimal, args.fork, root / "dist/index.js"]:
    if not source.is_file():
        parser.error(f"Build/install prerequisite missing: {source}")
artifacts = Path(tempfile.mkdtemp(prefix="pi-activity-smoke-"))
for mode in ["actual-idle", "sample"]:
    profile = artifacts / mode
    profile.mkdir()
    log = profile / "events.jsonl"
    log.write_text("")
    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 32, 100, 0, 0))
    env = {"HOME": str(profile), "PATH": os.environ["PATH"], "TERM": "xterm-256color", "LANG": "en_US.UTF-8",
           "PI_CODING_AGENT_DIR": str(profile / "agent"), "PI_SUBAGENTS_TEMP_ROOT": str(profile / "runs"),
           "PI_OFFLINE": "1", "COMPANION_TEST_MODE": mode, "COMPANION_TEST_LOG": str(log)}
    command = ["node", str(host), "--offline", "--no-session", "--no-extensions", "--no-skills",
               "--no-prompt-templates", "--no-context-files", "--no-mcp", "--no-tools", "--no-approve",
               "--tui-mode", "fullscreen", "-e", str(args.minimal.resolve())]
    if mode == "actual-idle":
        command += ["-e", str(args.fork.resolve())]
    command += ["-e", str(root / "test/fixtures/smoke-provider.mjs"), "-e", str(root / "dist/index.js")]
    process = subprocess.Popen(command, cwd=profile, env=env, stdin=slave, stdout=slave, stderr=slave, start_new_session=True)
    os.close(slave)
    output = bytearray()
    deadline = time.monotonic() + 15
    try:
        while time.monotonic() < deadline:
            if select.select([master], [], [], .2)[0]:
                try:
                    output.extend(os.read(master, 65536))
                except OSError:
                    break
            if process.poll() is not None:
                break
        if process.poll() is None:
            process.terminate()
        process.wait(timeout=5)
        (profile / "terminal.log").write_bytes(output)
        assert process.returncode == 0, (mode, process.returncode)
        records = [json.loads(line) for line in log.read_text().splitlines()]
        publications = [record for record in records if "publication" in record]
        assert publications and all(record["result"]["ok"] for record in publications), records
        if mode == "actual-idle":
            assert publications[-1]["publication"]["rows"] == [], records
        else:
            assert b"SAMPLE-WORKER" in output
            states = [record["publication"]["rows"][0]["state"] for record in publications if record["publication"]["rows"]]
            assert "running" in states and "completed" in states, states
            assert publications[-1]["publication"]["rows"][0]["metrics"]["tokens"] == 25
        print(f"{mode}: PASS ({len(publications)} accepted publications)")
    finally:
        if process.poll() is None:
            process.terminate()
            process.wait(timeout=5)
        os.close(master)
print(f"Artifacts: {artifacts}")

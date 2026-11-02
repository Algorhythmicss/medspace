const command = Buffer.from("zINSTREAM\0");
export const maximumBytes = 4 * 1024 * 1024;
export const maximumFrames = 1024;

export function instreamGuard(forward) {
  let phase = "command", pending = Buffer.alloc(0), remaining = 0, total = 0, frames = 0, wireBytes = 0, complete = false;
  return {
    get complete() { return complete; },
    push(chunk) {
      if (complete) throw new Error("Only one scan command is accepted");
      wireBytes += chunk.length;
      if (wireBytes > maximumBytes + maximumFrames * 4 + command.length + 4) throw new Error("Scan wire limit exceeded");
      let data = pending.length ? Buffer.concat([pending, chunk]) : chunk;
      pending = Buffer.alloc(0);
      while (data.length) {
        if (phase === "command") {
          if (data.length < command.length) { pending = Buffer.from(data); return; }
          if (!data.subarray(0, command.length).equals(command)) throw new Error("Only INSTREAM is accepted");
          forward(command); data = data.subarray(command.length); phase = "length";
        } else if (phase === "length") {
          if (data.length < 4) { pending = Buffer.from(data); return; }
          remaining = data.readUInt32BE(0);
          if (remaining === 0) {
            if (total === 0) throw new Error("Empty scans are not accepted");
            if (data.length !== 4) throw new Error("Trailing commands are not accepted");
            complete = true; forward(data.subarray(0, 4)); return;
          }
          frames += 1; total += remaining;
          if (remaining > 65536 || total > maximumBytes || frames > maximumFrames) throw new Error("Scan frame limit exceeded");
          forward(data.subarray(0, 4)); data = data.subarray(4); phase = "body";
        } else {
          const length = Math.min(remaining, data.length);
          forward(data.subarray(0, length)); data = data.subarray(length); remaining -= length;
          if (remaining === 0) phase = "length";
        }
      }
    },
  };
}

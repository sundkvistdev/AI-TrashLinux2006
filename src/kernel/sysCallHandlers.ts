import { ManagedVirtualMachine } from "./mvm";

export type SysCallHandler = (mvm: ManagedVirtualMachine, target: string) => void;

export const sysCallHandlers: Record<string, SysCallHandler> = {
  "Console.WriteLine": (mvm, target) => {
    const popped = mvm.state.stack.pop() || "";
    const text = String(popped).replace(/"/g, "");
    mvm.state.logs.push(`[Console.Out] ${text}`);
  },
  "Console.Write": (mvm, target) => {
    const popped = mvm.state.stack.pop() || "";
    const text = String(popped).replace(/"/g, "");
    const lastIdx = mvm.state.logs.length - 1;
    if (lastIdx >= 0 && mvm.state.logs[lastIdx].startsWith("[Console.Out] ")) {
      mvm.state.logs[lastIdx] += text;
    } else {
      mvm.state.logs.push(`[Console.Out] ${text}`);
    }
  },
  "Console.ReadLine": (mvm, target) => {
    let inputVal = "tux_input";
    if (mvm.onReadLine) {
      inputVal = mvm.onReadLine();
    } else {
      try {
        const prompted = window.prompt("Enter console input:");
        if (prompted !== null) inputVal = prompted;
      } catch {}
    }
    mvm.state.stack.push(`"${inputVal}"`);
    mvm.state.logs.push(`[Console.In] Read: "${inputVal}"`);
  },
  "Console.Clear": (mvm, target) => {
    mvm.state.logs = mvm.state.logs.filter(l => !l.startsWith("[Console.Out]"));
  },
  "Console.Beep": (mvm, target) => {
    if (mvm.onBeep) {
      mvm.onBeep();
    } else {
      mvm.state.logs.push(`[Console.Out] *BEEP*`);
    }
  },
  "Console.SetColor": (mvm, target) => {
    const color = (mvm.state.stack.pop() || "").replace(/"/g, "");
    if (mvm.onSetColor) {
      mvm.onSetColor(color);
    } else {
      mvm.state.logs.push(`[Console.Out] (Text color set to: ${color})`);
    }
  },
  "Math.Sqrt": (mvm, target) => {
    if (mvm.state.stack.length > 0) {
      const val = parseFloat(mvm.state.stack.pop()!);
      mvm.state.stack.push(String(isNaN(Math.sqrt(val)) ? 0 : Math.sqrt(val)));
    }
  },
  "Math.Abs": (mvm, target) => {
    if (mvm.state.stack.length > 0) {
      const val = parseFloat(mvm.state.stack.pop()!);
      mvm.state.stack.push(String(isNaN(Math.abs(val)) ? 0 : Math.abs(val)));
    }
  },
  "Math.Pow": (mvm, target) => {
    if (mvm.state.stack.length >= 2) {
      const exponent = parseFloat(mvm.state.stack.pop()!);
      const base = parseFloat(mvm.state.stack.pop()!);
      mvm.state.stack.push(String(isNaN(Math.pow(base, exponent)) ? 0 : Math.pow(base, exponent)));
    }
  },
  "Math.Random": (mvm, target) => {
    mvm.state.stack.push(String(Math.random()));
  },
  "Math.Max": (mvm, target) => {
    if (mvm.state.stack.length >= 2) {
      const b = parseFloat(mvm.state.stack.pop()!);
      const a = parseFloat(mvm.state.stack.pop()!);
      mvm.state.stack.push(String(Math.max(a, b)));
    }
  },
  "Math.Min": (mvm, target) => {
    if (mvm.state.stack.length >= 2) {
      const b = parseFloat(mvm.state.stack.pop()!);
      const a = parseFloat(mvm.state.stack.pop()!);
      mvm.state.stack.push(String(Math.min(a, b)));
    }
  },
  "Math.Round": (mvm, target) => {
    if (mvm.state.stack.length > 0) {
      const val = parseFloat(mvm.state.stack.pop()!);
      mvm.state.stack.push(String(Math.round(val)));
    }
  },
  "Environment.GetTime": (mvm, target) => {
    mvm.state.stack.push(String(Date.now()));
  },
  "Environment.GetOSVersion": (mvm, target) => {
    mvm.state.stack.push('"TrashLinux v0.04a-stable"');
  },
  "Environment.GetCurrentUser": (mvm, target) => {
    mvm.state.stack.push('"tux"');
  },
  "StringUtil.Concat": (mvm, target) => {
    if (mvm.state.stack.length >= 2) {
      const b = String(mvm.state.stack.pop()!).replace(/"/g, "");
      const a = String(mvm.state.stack.pop()!).replace(/"/g, "");
      mvm.state.stack.push(`"${a}${b}"`);
    }
  },
  "StringUtil.Length": (mvm, target) => {
    if (mvm.state.stack.length > 0) {
      const s = String(mvm.state.stack.pop()!).replace(/"/g, "");
      mvm.state.stack.push(String(s.length));
    }
  },
  "StringUtil.ToUpper": (mvm, target) => {
    if (mvm.state.stack.length > 0) {
      const s = String(mvm.state.stack.pop()!).replace(/"/g, "");
      mvm.state.stack.push(`"${s.toUpperCase()}"`);
    }
  },
  "StringUtil.ToLower": (mvm, target) => {
    if (mvm.state.stack.length > 0) {
      const s = String(mvm.state.stack.pop()!).replace(/"/g, "");
      mvm.state.stack.push(`"${s.toLowerCase()}"`);
    }
  }
};

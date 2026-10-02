import { WindowsActiveWindowProvider } from "./providers/windows/windows-active-window-provider.js";

const provider = new WindowsActiveWindowProvider();

console.log("Active IDE monitor started.");
console.log("Switch between VS Code, Antigravity, Chrome, etc.");
console.log("Press Ctrl+C to stop.\n");

let lastResult: string | null = null;

setInterval(async () => {
  const result = await provider.getActiveIde();
  const current = result?.ide ?? null;

  if (current !== lastResult) {
    lastResult = current;

    console.log(
      `[${new Date().toLocaleTimeString()}] Active IDE: ${
        current ?? "none"
      }`,
    );
  }
}, 500);
import { PauseIcon, PlayIcon } from "./icons";

// The moving blue background of the consent screen and of Log in and Save
// account (styles: "Lava lamp" in app/globals.css). Decoration only, so
// screen readers skip it. Paused, it is a still picture.
export function LavaLamp({ paused }: { paused: boolean }) {
  return (
    <div className="lava" aria-hidden="true" data-paused={paused || undefined}>
      <div className="lava__blob lava__blob--a" />
      <div className="lava__blob lava__blob--b" />
      <div className="lava__blob lava__blob--c" />
      <div className="lava__blob lava__blob--d" />
    </div>
  );
}

// Stops or restarts the lamp for now (WCAG 2.2.2). The "Moving background"
// switch in Settings stops it on this device; then this button isn't shown.
export function LavaToggle({ paused, onToggle }: { paused: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="icon-button lava-toggle"
      aria-label={paused ? "Play background motion" : "Pause background motion"}
      onClick={(event) => {
        // In Settings, a click that reaches the layer closes the dialog.
        event.stopPropagation();
        onToggle();
      }}
    >
      {paused ? <PlayIcon /> : <PauseIcon />}
    </button>
  );
}

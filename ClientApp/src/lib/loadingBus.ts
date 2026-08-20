// Tiny global in-flight request tracker. apiRequest() increments/decrements the
// counter around every call; the GlobalLoader overlay subscribes to render while busy.
// A counter (not a boolean) handles concurrent/overlapping requests correctly.

type Listener = (active: number) => void;

let active = 0;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l(active);
}

export function beginRequest() {
  active += 1;
  emit();
}

export function endRequest() {
  active = Math.max(0, active - 1);
  emit();
}

export function getActiveRequests() {
  return active;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  listener(active); // push current state immediately
  return () => { listeners.delete(listener); };
}

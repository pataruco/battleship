/** A tiny observable state holder. Fires `change` after every `set`. */
export class Store<S extends object> extends EventTarget {
  private state: S;

  constructor(initial: S) {
    super();
    this.state = initial;
  }

  get(): S {
    return this.state;
  }

  set(patch: Partial<S>): void {
    this.state = { ...this.state, ...patch };
    this.dispatchEvent(new Event('change'));
  }
}

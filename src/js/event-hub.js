class EventHub {
  constructor() {
    this._listeners = new Map();
    this._buffer = new Map();
    this._isBatching = false;
  }

  on(event, callback) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(callback);
    return () => this._listeners.get(event).delete(callback);
  }

  emit(event, data) {
    if (!this._buffer.has(event)) {
      this._buffer.set(event, []);
    }
    this._buffer.get(event).push(data);

    if (!this._isBatching) {
      this._isBatching = true;
      queueMicrotask(() => {
        this._flush();
      });
    }
  }

  _flush() {
    this._buffer.forEach((payloads, event) => {
      if (this._listeners.has(event)) {
        payloads.forEach(data => {
          this._listeners.get(event).forEach((cb) => cb(data));
        });
      }
      // Bridge to window CustomEvents so listeners using either system receive events
      payloads.forEach(data => {
        window.dispatchEvent(new CustomEvent(event, { detail: data }));
      });
    });
    this._buffer.clear();
    this._isBatching = false;
  }
}

export const eventHub = new EventHub();

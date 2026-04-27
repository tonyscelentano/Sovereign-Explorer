export class StateStore {
  constructor(initialState = {}) {
    this._subscribers = new Map();
    this._state = new Proxy(initialState, {
      set: (target, property, value) => {
        const oldValue = target[property];
        target[property] = value;
        if (oldValue !== value) {
          this._notify(property, value);
        }
        return true;
      },
    });
  }

  subscribe(property, callback) {
    if (!this._subscribers.has(property)) {
      this._subscribers.set(property, new Set());
    }
    this._subscribers.get(property).add(callback);
    return () => this._subscribers.get(property).delete(callback);
  }

  _notify(property, value) {
    if (this._subscribers.has(property)) {
      this._subscribers.get(property).forEach((callback) => callback(value));
    }
  }

  get state() {
    return this._state;
  }
}

export const appState = new StateStore({
  currentPath: '',
  entries: [],
  viewMode: 'list',
  selection: [],
  searchQuery: '',
  panes: [],
  activePaneId: 'primary',
  workspaceSplitOpen: false,
  showHidden: false,
  homeDir: '/',
});

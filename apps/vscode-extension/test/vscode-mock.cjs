/**
 * Mock vscode module for testing.
 * This file provides a minimal implementation of the vscode API for tests.
 */

class ThemeColor {
  constructor(id) {
    this.id = id;
  }
}

class StatusBarItem {
  constructor() {
    this.text = "";
    this.tooltip = "";
    this.color = undefined;
    this.backgroundColor = undefined;
  }

  show() {}
  dispose() {}
}

const StatusBarAlignment = {
  Left: 1,
  Right: 2,
};

const window = {
  createStatusBarItem() {
    return new StatusBarItem();
  },
};

// eslint-disable-next-line no-undef
module.exports = {
  ThemeColor,
  StatusBarAlignment,
  window,
};

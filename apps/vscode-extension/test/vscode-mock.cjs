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
    this.command = undefined;
  }

  show() {}
  dispose() {}
}

const StatusBarAlignment = {
  Left: 1,
  Right: 2,
};

// Track the last created status bar item for testing
let lastStatusBarItem = null;

const window = {
  createStatusBarItem() {
    lastStatusBarItem = new StatusBarItem();
    return lastStatusBarItem;
  },
};

// eslint-disable-next-line no-undef
module.exports = {
  ThemeColor,
  StatusBarAlignment,
  window,
  getLastStatusBarItem() {
    return lastStatusBarItem;
  },
};

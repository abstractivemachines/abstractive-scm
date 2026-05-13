export const panelStyles = String.raw`
    :root {
      color-scheme: light dark;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      --scm-pane-accent: var(--vscode-list-focusOutline, var(--vscode-focusBorder));
      --scm-active-header-background: var(--vscode-list-inactiveSelectionBackground, var(--vscode-sideBar-background));
      --scm-active-header-foreground: var(--vscode-list-inactiveSelectionForeground, var(--vscode-foreground));
      --scm-inactive-selection-background: var(--vscode-list-inactiveSelectionBackground, transparent);
      --scm-inactive-selection-foreground: var(--vscode-list-inactiveSelectionForeground, var(--vscode-editor-foreground));
      --scm-active-selection-background: var(--vscode-list-activeSelectionBackground, var(--vscode-list-inactiveSelectionBackground, transparent));
      --scm-active-selection-foreground: var(--vscode-list-activeSelectionForeground, var(--vscode-editor-foreground));
      --scm-pane-divider-size: 1px;
    }
    * {
      box-sizing: border-box;
    }
    body {
      margin: 0;
      overflow: hidden;
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
    }
    .shell {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      height: 100vh;
    }
    .toolbar {
      position: relative;
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      align-items: stretch;
      gap: 4px;
      min-width: 0;
      min-height: 34px;
      padding: 4px 10px 6px;
      border-bottom: 1px solid var(--vscode-sideBar-border);
      background: var(--vscode-sideBar-background);
      overflow: hidden;
    }
    .toolbar.has-status {
      min-height: 56px;
    }
    .toolbar-status {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 8px;
      overflow: hidden;
    }
    .toolbar-status[hidden] {
      display: none;
    }
    .title {
      font-weight: 600;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    button {
      height: 24px;
      padding: 0 8px;
      color: var(--vscode-button-secondaryForeground);
      background: var(--vscode-button-secondaryBackground);
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 4px;
      cursor: pointer;
    }
    button:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }
    button:disabled {
      opacity: 0.45;
      cursor: default;
    }
    .icon-button {
      width: 28px;
      min-width: 28px;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0;
    }
    .icon-button .codicon {
      font-size: 16px;
      line-height: 1;
    }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
    .toolbar button {
      flex: 0 0 auto;
      white-space: nowrap;
    }
    .repository-select {
      height: 24px;
      max-width: 220px;
      min-width: 132px;
      color: var(--vscode-dropdown-foreground);
      background: var(--vscode-dropdown-background);
      border: 1px solid var(--vscode-dropdown-border);
      border-radius: 4px;
    }
    .toolbar-actions {
      min-width: 0;
      display: flex;
      align-items: center;
      justify-content: flex-start;
      flex-wrap: wrap;
      gap: 4px;
      overflow: visible;
    }
    .loading {
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }
    .layout {
      display: grid;
      min-height: 0;
      height: 100%;
    }
    .layout.diff-right {
      grid-template-columns: var(--pane-columns, 180px var(--scm-pane-divider-size) 560px var(--scm-pane-divider-size) 280px var(--scm-pane-divider-size) 520px);
      grid-template-rows: minmax(0, 1fr);
    }
    .layout.diff-bottom {
      grid-template-columns: var(--main-pane-columns, 180px var(--scm-pane-divider-size) 560px var(--scm-pane-divider-size) 280px);
      grid-template-rows: minmax(0, 1fr) var(--scm-pane-divider-size) minmax(160px, var(--diff-pane-height, 280px));
    }
    .pane {
      position: relative;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
      border-right: 1px solid var(--vscode-sideBar-border);
      display: grid;
      grid-template-rows: 28px minmax(0, 1fr);
      background: var(--vscode-editor-background);
      transition: background-color 80ms ease-out;
    }
    .pane:last-child {
      border-right: 0;
    }
    .commit-pane {
      grid-template-rows: 28px auto minmax(0, 1fr);
    }
    .diff-pane {
      grid-template-rows: auto minmax(0, 1fr);
    }
    .pane.active-pane {
      box-shadow: inset 0 2px 0 var(--scm-pane-accent), inset 0 0 0 1px var(--scm-pane-accent);
    }
    .pane-divider {
      width: var(--scm-pane-divider-size);
      min-width: var(--scm-pane-divider-size);
      position: relative;
      z-index: 4;
      background: var(--vscode-sideBar-border);
      cursor: col-resize;
    }
    .pane-divider::before {
      content: "";
      position: absolute;
      top: 0;
      bottom: 0;
      left: -5px;
      width: 11px;
      cursor: col-resize;
    }
    .pane-divider::after {
      content: "";
      position: absolute;
      top: 0;
      bottom: 0;
      left: 0;
      width: 1px;
      background: transparent;
    }
    .pane-divider:hover::after,
    .pane-divider.dragging::after {
      background: var(--scm-pane-accent);
    }
    .layout.diff-bottom [data-pane="branches"] {
      grid-column: 1;
      grid-row: 1;
    }
    .layout.diff-bottom [data-divider="0"] {
      grid-column: 2;
      grid-row: 1;
    }
    .layout.diff-bottom [data-pane="commits"] {
      grid-column: 3;
      grid-row: 1;
    }
    .layout.diff-bottom [data-divider="1"] {
      grid-column: 4;
      grid-row: 1;
    }
    .layout.diff-bottom [data-pane="files"] {
      grid-column: 5;
      grid-row: 1;
      border-right: 0;
    }
    .layout.diff-bottom [data-divider="2"] {
      grid-column: 1 / -1;
      grid-row: 2;
      width: auto;
      height: var(--scm-pane-divider-size);
      min-height: var(--scm-pane-divider-size);
      cursor: row-resize;
    }
    .layout.diff-bottom [data-divider="2"]::before {
      top: -5px;
      bottom: auto;
      left: 0;
      right: 0;
      width: auto;
      height: 11px;
      cursor: row-resize;
    }
    .layout.diff-bottom [data-divider="2"]::after {
      top: 0;
      bottom: auto;
      left: 0;
      right: 0;
      width: auto;
      height: 1px;
    }
    .layout.diff-bottom .diff-pane {
      grid-column: 1 / -1;
      grid-row: 3;
      border-top: 1px solid var(--vscode-sideBar-border);
      border-right: 0;
    }
    .pane-title {
      position: relative;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0 10px 0 14px;
      color: var(--vscode-sideBarTitle-foreground);
      background: var(--vscode-sideBar-background);
      border-bottom: 1px solid var(--vscode-sideBar-border);
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .pane-title::before {
      content: "";
      position: absolute;
      left: 6px;
      width: 3px;
      height: 14px;
      border-radius: 2px;
      background: transparent;
    }
    .pane.active-pane .pane-title {
      color: var(--scm-active-header-foreground);
      background: var(--scm-active-header-background);
      border-bottom-color: var(--scm-pane-accent);
    }
    .pane.active-pane .pane-title::before {
      background: var(--scm-pane-accent);
    }
    .pane-title input {
      width: 100%;
      min-width: 80px;
      height: 20px;
      padding: 0 6px;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 3px;
      font-size: 12px;
      text-transform: none;
      font-weight: 400;
    }
    .pane-title button {
      height: 20px;
      min-width: 24px;
      padding: 0 6px;
      color: var(--vscode-button-secondaryForeground);
      background: transparent;
      border: 1px solid transparent;
      border-radius: 3px;
      font-size: 11px;
    }
    .pane-title button.icon-button {
      width: 24px;
      min-width: 24px;
      padding: 0;
    }
    .pane-title button.icon-button .codicon {
      font-size: 14px;
    }
    .pane-title button.active {
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
    }
    .history-chip {
      display: inline-grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      flex: 0 1 260px;
      min-width: 0;
      max-width: 260px;
      height: 20px;
      padding: 0 2px 0 7px;
      color: var(--vscode-badge-foreground);
      background: var(--vscode-badge-background);
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 3px;
      font-size: 11px;
      font-weight: 600;
      text-transform: none;
    }
    .history-chip[hidden] {
      display: none;
    }
    .history-chip-label {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .pane-title .history-close {
      width: 18px;
      min-width: 18px;
      height: 18px;
      padding: 0;
      color: inherit;
      background: transparent;
      border: 0;
      opacity: 0.8;
      line-height: 16px;
    }
    .pane-title .history-close:hover {
      opacity: 1;
      background: color-mix(in srgb, currentColor 16%, transparent);
    }
    .branch-title {
      display: grid;
      grid-template-columns: auto minmax(70px, 1fr) auto auto auto;
    }
    .file-title {
      display: grid;
      grid-template-columns: auto minmax(70px, 1fr) auto auto auto auto auto;
    }
    .commit-title {
      display: flex;
    }
    .commit-title input {
      flex: 1 1 90px;
    }
    .diff-title {
      flex-wrap: wrap;
      min-height: 28px;
      height: auto;
    }
    .list,
    .grid,
    .diff {
      overflow: auto;
      min-height: 0;
    }
    .diff.diff-split-mode {
      --diff-column-width: 50%;
      overflow: hidden;
    }
    .monaco-diff {
      width: 100%;
      height: 100%;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
    }
    .diff:focus {
      outline: none;
    }
    .grid {
      position: relative;
    }
    .list {
      position: relative;
    }
    .list.loading-files .row {
      opacity: 0.58;
    }
    .list.loading-files::after {
      content: "Loading files...";
      position: sticky;
      bottom: 0;
      display: block;
      padding: 5px 10px;
      color: var(--vscode-descriptionForeground);
      background: var(--vscode-sideBar-background);
      border-top: 1px solid var(--vscode-sideBar-border);
      font-size: 11px;
    }
    .diff-stack {
      display: grid;
      grid-template-rows: minmax(0, 1fr) auto;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
    }
    .diff-stack.details-hidden {
      grid-template-rows: minmax(0, 1fr);
    }
    .row {
      box-sizing: border-box;
      width: 100%;
      display: grid;
      gap: 2px;
      padding: 6px 10px;
      border: 0;
      border-bottom: 1px solid var(--vscode-sideBar-border);
      color: var(--vscode-editor-foreground);
      background: transparent;
      text-align: left;
      cursor: pointer;
    }
    .row:hover {
      background: var(--vscode-list-hoverBackground, color-mix(in srgb, var(--vscode-editor-foreground) 6%, transparent));
    }
    .row.selected {
      color: var(--scm-inactive-selection-foreground);
      background: var(--scm-inactive-selection-background);
      box-shadow: inset 3px 0 0 var(--scm-pane-accent);
    }
    .row.focused {
      outline: 1px solid var(--scm-pane-accent);
      outline-offset: -1px;
    }
    .row.selected.focused {
      box-shadow: inset 4px 0 0 var(--scm-pane-accent);
    }
    .row.selected:hover {
      background: var(--scm-inactive-selection-background);
    }
    .pane.active-pane .row:hover:not(.selected) {
      background: var(--vscode-list-hoverBackground, transparent);
    }
    .pane.active-pane .row.selected {
      color: var(--scm-active-selection-foreground);
      background: var(--scm-active-selection-background);
      box-shadow: inset 4px 0 0 var(--scm-pane-accent);
    }
    .pane.active-pane .row.selected:hover {
      background: var(--scm-active-selection-background);
    }
    .primary,
    .secondary {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .primary {
      font-weight: 500;
    }
    .secondary {
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }
    .selected .secondary {
      color: inherit;
      opacity: 0.82;
    }
    .branch-row {
      grid-template-columns: minmax(0, 1fr) auto;
    }
    .commit-header,
    .commit-row {
      grid-template-columns: var(--commit-columns, 56px 74px 120px 142px minmax(220px, 1fr));
      align-items: center;
      column-gap: 8px;
    }
    .commit-header {
      position: sticky;
      top: 0;
      z-index: 1;
      display: grid;
      min-height: 26px;
      padding: 0 10px;
      border-bottom: 1px solid var(--vscode-sideBar-border);
      color: var(--vscode-descriptionForeground);
      background: var(--vscode-sideBar-background);
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .pane.active-pane .commit-header {
      color: var(--scm-active-header-foreground);
      background: var(--scm-active-header-background);
    }
    .commit-summary {
      min-width: 0;
      height: 50px;
      padding: 7px 10px;
      overflow: hidden;
      border-bottom: 1px solid var(--vscode-sideBar-border);
      background: var(--vscode-editor-background);
    }
    .commit-summary[hidden] {
      display: none;
    }
    .commit-summary-title {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 600;
    }
    .commit-summary-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 12px;
      margin-top: 3px;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      max-height: 16px;
      overflow: hidden;
    }
    .commit-summary-meta span {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .commit-column {
      position: relative;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .commit-header .commit-column {
      align-self: stretch;
      display: flex;
      align-items: center;
    }
    .resize-handle {
      position: absolute;
      top: 0;
      right: 0;
      width: 8px;
      height: 100%;
      cursor: col-resize;
      z-index: 2;
    }
    .resize-handle::after {
      content: "";
      position: absolute;
      top: 5px;
      right: 3px;
      width: 1px;
      height: calc(100% - 10px);
      background: var(--vscode-sideBar-border);
    }
    .resize-handle:hover::after,
    .resize-handle.dragging::after {
      background: var(--vscode-focusBorder);
    }
    .graph {
      min-width: 0;
      overflow: hidden;
      text-align: left;
    }
    .commit-row.has-graph .hash {
      grid-column: 2;
    }
    .commit-row.has-graph .author {
      grid-column: 3;
    }
    .commit-row.has-graph .date {
      grid-column: 4;
    }
    .commit-row.has-graph .subject {
      grid-column: 5;
    }
    .commit-graph-overlay {
      position: absolute;
      z-index: 1;
      pointer-events: none;
      overflow: visible;
    }
    .graph-line {
      stroke-width: 2.15;
      stroke-linecap: round;
      stroke-linejoin: round;
      fill: none;
      opacity: 0.72;
    }
    .graph-line.primary {
      opacity: 1;
      stroke-width: 2.7;
    }
    .graph-node {
      fill: var(--vscode-editor-background);
      stroke-width: 2.2;
    }
    .graph-node-inner {
      fill: currentColor;
      opacity: 0;
    }
    .graph-node.selected {
      fill: color-mix(in srgb, currentColor 16%, var(--vscode-editor-background));
      stroke-width: 2.9;
    }
    .graph-node-inner.selected {
      opacity: 1;
    }
    .author,
    .date,
    .subject {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .date,
    .author {
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
    }
    .selected .date,
    .selected .author {
      color: inherit;
      opacity: 0.82;
    }
    .subject-line {
      display: flex;
      align-items: center;
      gap: 4px;
      min-width: 0;
      overflow: hidden;
    }
    .subject-text {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .ref-labels {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      min-width: 0;
      flex: 0 1 auto;
      overflow: hidden;
    }
    .ref-label {
      max-width: 120px;
      padding: 0 5px;
      color: var(--vscode-badge-foreground);
      background: var(--vscode-badge-background);
      border-radius: 3px;
      font-size: 10px;
      font-weight: 600;
      line-height: 16px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      text-transform: none;
    }
    .ref-label.remote {
      color: var(--vscode-gitDecoration-modifiedResourceForeground);
      background: color-mix(in srgb, var(--vscode-gitDecoration-modifiedResourceForeground) 18%, transparent);
    }
    .ref-label.tag {
      color: var(--vscode-gitDecoration-addedResourceForeground);
      background: color-mix(in srgb, var(--vscode-gitDecoration-addedResourceForeground) 18%, transparent);
    }
    .ref-label.head {
      color: var(--vscode-editor-background);
      background: var(--vscode-focusBorder);
    }
    .branch-kind {
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
    }
    .status {
      justify-self: end;
      width: 24px;
      min-width: 24px;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      font-weight: 600;
      text-align: right;
    }
    .status.added {
      color: var(--vscode-gitDecoration-addedResourceForeground);
    }
    .status.modified {
      color: var(--vscode-gitDecoration-modifiedResourceForeground);
    }
    .status.deleted {
      color: var(--vscode-gitDecoration-deletedResourceForeground);
    }
    .status.renamed {
      color: var(--vscode-gitDecoration-renamedResourceForeground, var(--vscode-gitDecoration-modifiedResourceForeground));
    }
    .hash {
      color: var(--vscode-gitDecoration-modifiedResourceForeground);
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
    }
    .file-row {
      grid-template-columns: 24px minmax(0, 1fr) 24px;
      align-items: center;
      column-gap: 8px;
    }
    .file-main {
      min-width: 0;
    }
    .file-icon {
      justify-self: center;
      width: 22px;
      overflow: hidden;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      font-weight: 700;
      line-height: 1;
      text-align: center;
      text-transform: uppercase;
    }
    .file-icon.type-ts,
    .file-icon.type-js,
    .file-icon.type-jsx,
    .file-icon.type-tsx {
      color: var(--vscode-charts-blue);
    }
    .file-icon.type-json {
      color: var(--vscode-charts-yellow);
    }
    .file-icon.type-md,
    .file-icon.type-mdx {
      color: var(--vscode-gitDecoration-modifiedResourceForeground);
    }
    .file-icon.type-css,
    .file-icon.type-scss,
    .file-icon.type-less {
      color: var(--vscode-charts-purple);
    }
    .file-icon.type-html,
    .file-icon.type-svg {
      color: var(--vscode-charts-orange);
    }
    .empty {
      padding: 12px 10px;
      color: var(--vscode-descriptionForeground);
    }
    .details {
      min-height: 134px;
      max-height: 180px;
      overflow: auto;
      scrollbar-gutter: stable;
      padding: 8px 12px;
      border-top: 1px solid var(--vscode-sideBar-border);
      background: var(--vscode-sideBar-background);
    }
    .details[hidden] {
      display: none;
    }
    .details-title {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 600;
      margin-bottom: 4px;
      min-height: 17px;
    }
    .details-meta {
      color: var(--vscode-descriptionForeground);
      font-size: 12px;
      line-height: 1.45;
      min-height: 18px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .details-body {
      margin-top: 6px;
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-editor-font-family);
      font-size: 12px;
      white-space: pre-wrap;
    }
    .details-row {
      display: grid;
      grid-template-columns: 92px minmax(0, 1fr);
      column-gap: 8px;
      min-height: 18px;
      line-height: 1.45;
      font-size: 12px;
    }
    .details-label {
      color: var(--vscode-descriptionForeground);
    }
    .details-value {
      min-width: 0;
      overflow-wrap: anywhere;
    }
    pre {
      margin: 0;
      padding: 8px 0;
      font-family: var(--vscode-editor-font-family);
      font-size: var(--vscode-editor-font-size);
      line-height: 1.45;
    }
    .line {
      display: block;
      min-height: 1.45em;
      padding: 0 12px;
      white-space: pre;
    }
    .line.add {
      color: var(--vscode-gitDecoration-addedResourceForeground);
      background: color-mix(in srgb, var(--vscode-gitDecoration-addedResourceForeground) 12%, transparent);
    }
    .line.del {
      color: var(--vscode-gitDecoration-deletedResourceForeground);
      background: color-mix(in srgb, var(--vscode-gitDecoration-deletedResourceForeground) 12%, transparent);
    }
    .line.hunk {
      color: var(--vscode-gitDecoration-modifiedResourceForeground);
      background: var(--vscode-editor-lineHighlightBackground);
      cursor: pointer;
      user-select: none;
    }
    .line.current-hunk {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: -1px;
      background: color-mix(in srgb, var(--vscode-gitDecoration-modifiedResourceForeground) 18%, var(--vscode-editor-lineHighlightBackground));
    }
    .line.meta {
      color: var(--vscode-descriptionForeground);
    }
    .word-change {
      border-radius: 2px;
      background: color-mix(in srgb, currentColor 26%, transparent);
    }
    .diff-stats {
      align-self: center;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      font-weight: 500;
      text-transform: none;
      white-space: nowrap;
    }
    .diff-side {
      display: grid;
      grid-template-columns: minmax(0, var(--diff-column-width)) minmax(0, var(--diff-column-width));
      width: calc(var(--diff-column-width) * 2);
      height: 100%;
      max-width: 100%;
      min-width: 0;
      overflow: hidden;
      contain: layout paint size;
      font-family: var(--vscode-editor-font-family);
      font-size: var(--vscode-editor-font-size);
      line-height: 1.45;
    }
    .diff-column {
      width: var(--diff-column-width);
      min-width: 0;
      max-width: var(--diff-column-width);
      overflow: hidden;
      contain: layout paint size;
      border-right: 1px solid var(--vscode-sideBar-border);
    }
    .diff-column:last-child {
      border-right: 0;
    }
    .diff-column-scroll {
      height: 100%;
      min-width: 0;
      overflow-x: hidden;
      overflow-y: auto;
      padding: 8px 0;
      scrollbar-gutter: stable;
    }
    .diff-side-line {
      display: grid;
      grid-template-columns: 52px minmax(0, 1fr);
      min-width: 0;
      min-height: 1.45em;
    }
    .diff-line-number {
      position: sticky;
      left: 0;
      z-index: 1;
      padding: 0 8px;
      color: var(--vscode-editorLineNumber-foreground, var(--vscode-descriptionForeground));
      background: var(--vscode-editor-background);
      border-right: 1px solid var(--vscode-sideBar-border);
      text-align: right;
      user-select: none;
    }
    .diff-line-code {
      min-width: 0;
      padding: 0 12px;
      overflow-wrap: anywhere;
      white-space: pre-wrap;
    }
    .diff-side-line.add {
      color: var(--vscode-gitDecoration-addedResourceForeground);
      background: color-mix(in srgb, var(--vscode-gitDecoration-addedResourceForeground) 12%, transparent);
    }
    .diff-side-line.del {
      color: var(--vscode-gitDecoration-deletedResourceForeground);
      background: color-mix(in srgb, var(--vscode-gitDecoration-deletedResourceForeground) 12%, transparent);
    }
    .diff-side-line.empty-side {
      background: color-mix(in srgb, var(--vscode-disabledForeground) 5%, transparent);
    }
    .diff-side-line.hunk {
      color: var(--vscode-gitDecoration-modifiedResourceForeground);
      background: var(--vscode-editor-lineHighlightBackground);
      cursor: pointer;
      user-select: none;
    }
    .diff-side-line.current-hunk {
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: -1px;
      background: color-mix(in srgb, var(--vscode-gitDecoration-modifiedResourceForeground) 18%, var(--vscode-editor-lineHighlightBackground));
    }
    .diff-side-line.meta {
      color: var(--vscode-descriptionForeground);
    }
    .error {
      color: var(--vscode-errorForeground);
      padding-left: 8px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .context-menu {
      position: fixed;
      z-index: 20;
      min-width: 180px;
      padding: 4px;
      display: none;
      background: var(--vscode-menu-background);
      color: var(--vscode-menu-foreground);
      border: 1px solid var(--vscode-menu-border, var(--vscode-sideBar-border));
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.28);
    }
    .context-menu.open {
      display: block;
    }
    .context-menu button {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      height: 26px;
      padding: 0 10px;
      color: var(--vscode-menu-foreground);
      background: transparent;
      border: 0;
      border-radius: 0;
      text-align: left;
    }
    .context-menu button .codicon {
      flex: 0 0 auto;
      font-size: 15px;
      line-height: 1;
    }
    .context-menu button .menu-label {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .context-menu button:hover:not(:disabled),
    .context-menu button:focus:not(:disabled) {
      color: var(--vscode-menu-selectionForeground);
      background: var(--vscode-menu-selectionBackground);
    }
    .help-overlay {
      position: fixed;
      inset: 0;
      z-index: 30;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background: rgba(0, 0, 0, 0.36);
    }
    .help-overlay.open {
      display: flex;
    }
    .help-dialog {
      width: min(620px, 100%);
      max-height: min(680px, 100%);
      overflow: auto;
      color: var(--vscode-editor-foreground);
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-sideBar-border);
      box-shadow: 0 10px 34px rgba(0, 0, 0, 0.34);
    }
    .help-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 12px;
      border-bottom: 1px solid var(--vscode-sideBar-border);
      font-weight: 600;
    }
    .help-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px 18px;
      padding: 12px;
    }
    .help-row {
      display: grid;
      grid-template-columns: 96px minmax(0, 1fr);
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .key {
      display: inline-block;
      min-width: 24px;
      padding: 1px 6px;
      color: var(--vscode-editor-foreground);
      background: var(--vscode-keybindingLabel-background);
      border: 1px solid var(--vscode-keybindingLabel-border, var(--vscode-sideBar-border));
      border-bottom-color: var(--vscode-keybindingLabel-bottomBorder, var(--vscode-sideBar-border));
      border-radius: 3px;
      font-family: var(--vscode-editor-font-family);
      font-size: 11px;
      text-align: center;
      white-space: nowrap;
    }
    @media (max-width: 980px) {
      .layout.diff-right {
        grid-template-columns: var(--pane-columns, 150px var(--scm-pane-divider-size) 420px var(--scm-pane-divider-size) 220px var(--scm-pane-divider-size) 360px);
      }
      .commit-header,
      .commit-row {
        grid-template-columns: 22px 64px minmax(180px, 1fr);
      }
      .author,
      .date,
      .commit-header .author-col,
      .commit-header .date-col {
        display: none;
      }
      .layout.diff-right .diff-pane {
        grid-column: 1 / -1;
        border-top: 1px solid var(--vscode-sideBar-border);
      }
    }
    @media (max-width: 1180px) {
      .toolbar button {
        padding: 0 7px;
      }
    }
    @media (max-width: 760px) {
      .toolbar-actions {
        width: 100%;
      }
      .help-grid {
        grid-template-columns: minmax(0, 1fr);
      }
    }
`;

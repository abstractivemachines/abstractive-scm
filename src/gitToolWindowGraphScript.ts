export const graphWebviewScript = String.raw`
    function buildGraphRows(commits) {
      const lanes = [];
      const laneColors = [];
      let nextColor = 0;
      const rows = new Map();
      commits.forEach((commit) => {
        const parents = commitParents(commit);
        let before = lanes.slice();
        const beforeColors = laneColors.slice();
        let lane = before.indexOf(commit.hash);
        const introduced = lane < 0;
        if (introduced) {
          lane = before.length;
          before.push(commit.hash);
          beforeColors.push(nextColor);
          nextColor += 1;
        }

        const after = before.slice();
        const afterColors = beforeColors.slice();
        const commitColor = beforeColors[lane] ?? lane;
        const parentTransitions = [];
        if (parents.length) {
          const firstParent = parents[0];
          const existingFirstParentLane = after.findIndex((item, index) => index !== lane && item === firstParent);
          let firstParentLane = lane;
          if (existingFirstParentLane >= 0) {
            after[lane] = undefined;
            afterColors[lane] = undefined;
            firstParentLane = existingFirstParentLane;
          } else {
            after[lane] = firstParent;
            afterColors[lane] = commitColor;
          }
          parentTransitions.push({ fromLane: lane, toLane: firstParentLane, colorIndex: commitColor });
          parents.slice(1).forEach((parent) => {
            const existing = after.indexOf(parent);
            if (existing >= 0) {
              parentTransitions.push({ fromLane: lane, toLane: existing, colorIndex: afterColors[existing] ?? existing });
              return;
            }

            const emptyLane = after.findIndex((item, index) => index > lane && !item);
            const insertAt = emptyLane >= 0 ? emptyLane : after.length;
            after[insertAt] = parent;
            afterColors[insertAt] = nextColor;
            parentTransitions.push({ fromLane: lane, toLane: insertAt, colorIndex: nextColor });
            nextColor += 1;
          });
        } else {
          after[lane] = undefined;
          afterColors[lane] = undefined;
        }
        const continuationTransitions = after
          .map((item, toLane) => {
            const fromLane = before.indexOf(item);
            return { item, fromLane, toLane, colorIndex: fromLane >= 0 ? beforeColors[fromLane] : afterColors[toLane] };
          })
          .filter((item) => item.item && item.fromLane >= 0 && item.fromLane === item.toLane);

        rows.set(commit.hash, {
          lane,
          laneCount: Math.max(
            before.length,
            after.length,
            lane + 1,
            ...parentTransitions.map((item) => Math.max(item.fromLane, item.toLane) + 1),
            ...continuationTransitions.map((item) => Math.max(item.fromLane, item.toLane) + 1)
          ),
          colorIndex: commitColor,
          topLanes: before
            .map((item, index) => ({ active: Boolean(item), lane: index, colorIndex: beforeColors[index] }))
            .filter((item) => item.active && (!introduced || item.lane !== lane)),
          continuationTransitions,
          parentTransitions
        });

        lanes.splice(0, lanes.length, ...compactTrailingEmptyLanes(after));
        laneColors.splice(0, laneColors.length, ...afterColors.slice(0, lanes.length));
      });
      return rows;
    }

    function compactTrailingEmptyLanes(lanes) {
      let lastActive = lanes.length - 1;
      while (lastActive >= 0 && !lanes[lastActive]) {
        lastActive -= 1;
      }
      return lanes.slice(0, lastActive + 1);
    }

    function graphLaneCount(rows) {
      let laneCount = 1;
      rows.forEach((row) => {
        laneCount = Math.max(laneCount, row.laneCount || 1);
      });
      return laneCount;
    }

    function clearCommitGraphOverlay() {
      graphCommits = [];
      graphRows = new Map();
      state.graphLaneCount = 1;
      if (graphRenderFrame) {
        cancelAnimationFrame(graphRenderFrame);
        graphRenderFrame = 0;
      }
      commitsEl.querySelector('.commit-graph-overlay')?.remove();
    }

    function scheduleCommitGraphOverlay() {
      if (graphRenderFrame) {
        cancelAnimationFrame(graphRenderFrame);
      }
      graphRenderFrame = requestAnimationFrame(() => {
        graphRenderFrame = 0;
        renderCommitGraphOverlay();
      });
    }

    function renderCommitGraphOverlay() {
      commitsEl.querySelector('.commit-graph-overlay')?.remove();
      const commits = graphCommits;
      const rows = Array.from(commitsEl.querySelectorAll('.commit-row.has-graph'));
      const graphHeader = commitsEl.querySelector('.commit-header .commit-column');
      if (!commits.length || !rows.length || !graphHeader) return;
      const firstRow = rows[0];
      const lastRow = rows[rows.length - 1];
      const left = graphHeader.offsetLeft;
      const top = firstRow.offsetTop;
      const metrics = graphMetrics(graphRows, graphHeader.clientWidth);
      const width = metrics.width;
      const height = Math.max(24, lastRow.offsetTop + lastRow.clientHeight - top);
      const x = (lane) => metrics.margin + lane * metrics.spacing;
      const yFor = (row, ratio) => row.offsetTop - top + row.clientHeight * ratio;
      const laneSegments = new Map();
      const primaryLaneSegments = new Map();
      const mergePaths = [];
      const primaryMergePaths = [];
      const nodes = [];
      const addSegment = (target, lane, start, end, colorIndex = lane) => {
        if (end <= start) return;
        const key = lane + ':' + colorIndex;
        const entry = target.get(key) || { lane, colorIndex, segments: [] };
        entry.segments.push([start, end]);
        target.set(key, entry);
      };

      commits.forEach((commit, index) => {
        const row = graphRows.get(commit.hash);
        const rowEl = rows[index];
        if (!row || !rowEl) return;
        const centerY = yFor(rowEl, 0.5);
        const topY = yFor(rowEl, 0);
        const bottomY = yFor(rowEl, 1);
        const selected = commit.hash === state.selectedCommit;
        const hovered = commit.hash === state.hoveredCommit;
        const emphasized = selected || hovered;
        row.topLanes.forEach((laneItem) => {
          addSegment(laneSegments, laneItem.lane, topY, centerY, laneItem.colorIndex);
          if (emphasized && laneItem.lane === row.lane) {
            addSegment(primaryLaneSegments, laneItem.lane, topY, centerY, laneItem.colorIndex);
          }
        });
        row.continuationTransitions.forEach((transition) => {
          addSegment(laneSegments, transition.fromLane, centerY, bottomY, transition.colorIndex);
          if (emphasized && transition.fromLane === row.lane) {
            addSegment(primaryLaneSegments, transition.fromLane, centerY, bottomY, transition.colorIndex);
          }
        });
        row.parentTransitions.forEach((transition) => {
          if (transition.fromLane === transition.toLane) {
            addSegment(laneSegments, transition.toLane, centerY, bottomY, transition.colorIndex);
            if (emphasized) {
              addSegment(primaryLaneSegments, transition.toLane, centerY, bottomY, transition.colorIndex);
            }
            return;
          }
          const path = graphTransitionPath(x(transition.fromLane), centerY, x(transition.toLane), bottomY);
          mergePaths.push(graphPath(path, transition.colorIndex, false));
          if (emphasized) {
            primaryMergePaths.push(graphPath(path, transition.colorIndex, true));
          }
        });
        const color = laneColor(row.colorIndex);
        nodes.push(
          (emphasized ? '<circle cx="' + x(row.lane) + '" cy="' + centerY + '" r="' + (selected ? metrics.selectedRingRadius : metrics.hoverRingRadius) + '" fill="none" stroke="' + color + '" stroke-width="' + (selected ? '1.25' : '1') + '" opacity="' + (selected ? '0.58' : '0.46') + '"/>' : '') +
          '<circle class="graph-node' + (emphasized ? ' selected' : '') + '" cx="' + x(row.lane) + '" cy="' + centerY + '" r="' + (selected ? metrics.selectedNodeRadius : hovered ? metrics.hoverNodeRadius : metrics.nodeRadius) + '" stroke="' + color + '" style="color: ' + color + '"/>' +
          '<circle class="graph-node-inner' + (emphasized ? ' selected' : '') + '" cx="' + x(row.lane) + '" cy="' + centerY + '" r="' + metrics.innerNodeRadius + '" style="color: ' + color + '"/>'
        );
      });

      const paths = laneSegmentPaths(laneSegments, x, false)
        .concat(mergePaths, laneSegmentPaths(primaryLaneSegments, x, true), primaryMergePaths);
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.classList.add('commit-graph-overlay');
      svg.setAttribute('width', String(width));
      svg.setAttribute('height', String(height));
      svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
      svg.style.left = left + 'px';
      svg.style.top = top + 'px';
      svg.innerHTML = paths.join('') + nodes.join('');
      commitsEl.append(svg);
    }

    function graphMetrics(graphRows, slotWidth) {
      const laneCount = graphLaneCount(graphRows);
      const margin = laneCount > 4 ? 12 : laneCount > 1 ? 14 : Math.min(18, Math.max(10, slotWidth / 2));
      const maxSpacing = 18;
      const available = Math.max(0, slotWidth - margin * 2);
      const spacing = laneCount > 1 ? Math.min(maxSpacing, available / Math.max(1, laneCount - 1)) : 0;
      const nodeRadius = laneCount > 1 ? Math.max(2.1, Math.min(3.55, spacing * 0.32)) : 3.55;
      return {
        margin,
        spacing,
        width: Math.max(1, slotWidth),
        nodeRadius,
        hoverNodeRadius: nodeRadius + 0.45,
        selectedNodeRadius: nodeRadius + 0.8,
        innerNodeRadius: Math.max(1.35, Math.min(1.85, nodeRadius * 0.52)),
        hoverRingRadius: nodeRadius + 2.45,
        selectedRingRadius: nodeRadius + 3.05
      };
    }

    function laneSegmentPaths(segmentsByLane, x, emphasized) {
      const paths = [];
      segmentsByLane.forEach((entry) => {
        const { lane, colorIndex, segments } = entry;
        segments.sort((a, b) => a[0] - b[0]);
        let current = undefined;
        segments.forEach((segment) => {
          if (!current) {
            current = segment.slice();
            return;
          }
          if (segment[0] <= current[1] + 0.5) {
            current[1] = Math.max(current[1], segment[1]);
          } else {
            paths.push(graphPath('M ' + x(lane) + ' ' + current[0] + ' L ' + x(lane) + ' ' + current[1], colorIndex, emphasized));
            current = segment.slice();
          }
        });
        if (current) {
          paths.push(graphPath('M ' + x(lane) + ' ' + current[0] + ' L ' + x(lane) + ' ' + current[1], colorIndex, emphasized));
        }
      });
      return paths;
    }

    function graphPath(pathData, lane, emphasized) {
      return '<path class="graph-line' + (emphasized ? ' primary' : '') + '" d="' + pathData + '" stroke="' + laneColor(lane) + '"/>';
    }

    function graphTransitionPath(fromX, fromY, toX, toY) {
      const deltaY = toY - fromY;
      if (Math.abs(toX - fromX) < 0.5 || deltaY <= 0) {
        return 'M ' + fromX + ' ' + fromY + ' L ' + toX + ' ' + toY;
      }
      const leadY = fromY + deltaY * 0.28;
      const tailY = fromY + deltaY * 0.82;
      const controlY1 = fromY + deltaY * 0.48;
      const controlY2 = fromY + deltaY * 0.62;
      return 'M ' + fromX + ' ' + fromY +
        ' L ' + fromX + ' ' + leadY +
        ' C ' + fromX + ' ' + controlY1 + ', ' + toX + ' ' + controlY2 + ', ' + toX + ' ' + tailY +
        ' L ' + toX + ' ' + toY;
    }

    function commitParents(commit) {
      if (Array.isArray(commit.parentHashes)) {
        return commit.parentHashes.filter(Boolean);
      }
      return String(commit.parents || '').split(/\\s+/).filter(Boolean);
    }

    function laneColor(index) {
      const colors = [
        'var(--vscode-gitDecoration-addedResourceForeground)',
        'var(--vscode-charts-blue)',
        'var(--vscode-charts-orange)',
        'var(--vscode-charts-purple)',
        'var(--vscode-charts-green)',
        'var(--vscode-charts-yellow)',
        'var(--vscode-charts-red)'
      ];
      return colors[Math.abs(index) % colors.length];
    }
`;

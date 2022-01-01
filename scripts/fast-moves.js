import { updateGm, getTimestamp, getAllTeachableMoves } from './gm.js';
import { sortMapByKeys, numericCompare, descendingNumericCompare, toLocaleFixed, removeAllChildren } from './utils.js';

// to avoid using floats as map keys, all per-turn values are scaled up to integers
// 3 * 4 * 5 = 60; If a 7+ turn move is released this will need to be updated
const lcmTurns = 60;

const excludedFastMoves = new Set([
  'WATER_GUN_FAST_BLASTOISE'
])

// Map ept => Map (ppt + ept) => Map turns => [moves]
function groupFastMoves(gm) {
  const seenMoves = getAllTeachableMoves(gm);
  const moves = new Map();
  for (const { combatMove } of gm) {
    if (combatMove === undefined) continue;
    if (excludedFastMoves.has(combatMove.uniqueId)) {
      // TM-able moves override the exclude list for future-proofing
      if (seenMoves.has(combatMove.uniqueId)) {
        console.warn('Found excluded move in use: "%s"', combatMove.uniqueId);
      } else {
        continue;
      }
    }

    const { energyDelta, durationTurns = 0, power = 0 } = combatMove;

    if (!(energyDelta > 0)) continue;

    const turns = durationTurns + 1; // adjust for gm values being 1 off
    const eptKey = energyDelta * lcmTurns / turns;
    const sumptKey = (energyDelta + power) * lcmTurns / turns;

    const energyBucket = moves.get(eptKey) ?? new Map();
    const powerBucket = energyBucket.get(sumptKey) ?? new Map();
    const turnBucket = powerBucket.get(turns) ?? [];
    turnBucket.push(combatMove);
    powerBucket.set(turns, turnBucket);
    energyBucket.set(sumptKey, powerBucket);
    moves.set(eptKey, energyBucket);
  }
  return moves;
}

function sortGroupedMoves(moves) {
  for (const [eptKey, energyBucket] of moves) {
    for (const [sumptKey, powerBucket] of energyBucket) {
      for (const turnBucket of powerBucket.values()) {
        // equality should not occur in source data, no need to handle
        turnBucket.sort((a, b) => a.uniqueId > b.uniqueId ? 1 : -1);
      }
      energyBucket.set(sumptKey, sortMapByKeys(powerBucket, numericCompare))
    }
    moves.set(eptKey, sortMapByKeys(energyBucket, numericCompare));
  }
  return sortMapByKeys(moves, descendingNumericCompare);
}

const moveNames = {
  WATER_GUN_FAST_BLASTOISE: 'Water Gun Blastoise'
};

function moveIdtoTitle(id) {
  // slice to remove _FAST suffix
  return moveNames[id] ?? id.slice(0, -5).split('_')
      .map(s => s[0].toUpperCase() + s.substring(1).toLowerCase())
      .join(' ');
}

function moveListToDom(turns, energy, power, moves) {
  const turnElem = document.createElement('figure');
  const turnHeader = document.createElement('figcaption');
  const capLeft = document.createElement('span');
  const capRight = document.createElement('span');
  capLeft.append(`${energy}e ${power}p`);
  capRight.append(` ${turns} turn${turns > 1 ? 's' : ''}`);
  turnHeader.append(capLeft, capRight);

  const moveList = document.createElement('ul');
  for (const move of moves) {
    const li = document.createElement('li')
    li.append(moveIdtoTitle(move.uniqueId));

    const typeImg = document.createElement('img');
    const type = move.type.substring(13).toLowerCase();
    typeImg.src = `images/type-icons.svg#${type}-badge`
    typeImg.alt = `${type}`;
    li.append(typeImg);

    moveList.append(li);
  }

  turnElem.append(turnHeader,  moveList);
  return turnElem;
}

function makeSpacerDom(units) {
  const spacerDiv = document.createElement('div');
  spacerDiv.classList.add('spacer');
  spacerDiv.style.setProperty('--spacer-units', units);
  return spacerDiv;
}

/**
 * <table>
 *  <tr>
 *    <th><div>4.5 ept</div></th>
 *    <td><div> ... ppt + ept < 6 </div></td>
 *    <td><div>ppt + ept = 6</div></td>
 *    <td><div> ... ppt + ept > 6 </div></td>
 *  </tr>
 * </table>
 */
function toDom(groupedMoves) {
  const table = document.createElement('table');
  const tbody = document.createElement('tbody');

  let minSumpt = Number.POSITIVE_INFINITY;
  let maxSumpt = Number.NEGATIVE_INFINITY;
  for (const [eptKey, energyBucket] of groupedMoves) {
    const sumptKeys = Array.from(energyBucket.keys());
    if (minSumpt > sumptKeys[0]) minSumpt = sumptKeys[0];
    if (maxSumpt < sumptKeys[sumptKeys.length - 1]) maxSumpt = sumptKeys[sumptKeys.length - 1];
  }
  for (const [eptKey, energyBucket] of groupedMoves) {
    const tr = document.createElement('tr');

    const th = document.createElement('th');
    th.scope = 'row';
    const thDiv = document.createElement('div');
    thDiv.append(`${toLocaleFixed(eptKey / lcmTurns, 2)} ept`);

    th.append(thDiv);
    tr.append(th);

    const tdLeft = document.createElement('td');
    const tdLeftDiv = document.createElement('div');
    let lastSumpt = minSumpt - lcmTurns / 3;
    for (const [sumptKey, powerBucket] of energyBucket) {
      if (sumptKey >= 6 * lcmTurns) break;

      if (sumptKey - lastSumpt > lcmTurns / 3) {
        tdLeftDiv.append(makeSpacerDom((sumptKey - lastSumpt) * 6 / lcmTurns - 2));
      }

      const pptDiv = document.createElement('div');
      pptDiv.classList.add('ppt-container');
      const pptLabelDiv = document.createElement('div');
      pptLabelDiv.append(`${toLocaleFixed((sumptKey - eptKey) / lcmTurns, 2)} ppt`);
      pptDiv.prepend(pptLabelDiv);
      for (const [turns, turnBucket] of powerBucket) {
        const turnElem = moveListToDom(turns, eptKey / (lcmTurns / turns), (sumptKey - eptKey) / (lcmTurns / turns), turnBucket);
        pptDiv.append(turnElem);
      }

      tdLeftDiv.append(pptDiv);
      lastSumpt = sumptKey;
    }
    const midSumpt = 6 * lcmTurns;
    if (midSumpt - lastSumpt > lcmTurns / 3) {
      tdLeftDiv.append(makeSpacerDom((midSumpt - lastSumpt) * 6 / lcmTurns - 2));
    }
    tdLeft.append(tdLeftDiv);
    tr.append(tdLeft);

    const tdMid = document.createElement('td');
    const tdMidDiv = document.createElement('div');
    tdMidDiv.classList.add('ppt-container');
    for (const [sumptKey, powerBucket] of energyBucket) {
      if (sumptKey < 6 * lcmTurns) continue;
      if (sumptKey > 6 * lcmTurns) break;

      const pptLabelDiv = document.createElement('div');
      pptLabelDiv.append(`${toLocaleFixed((sumptKey - eptKey) / lcmTurns, 2)} ppt`);
      tdMidDiv.prepend(pptLabelDiv);
      for (const [turns, turnBucket] of powerBucket) {
        const turnElem = moveListToDom(turns, eptKey / (lcmTurns / turns), (sumptKey - eptKey) / (lcmTurns / turns), turnBucket);
        tdMidDiv.append(turnElem);
      }
    }
    tdMid.append(tdMidDiv);
    tr.append(tdMid);

    lastSumpt = midSumpt;
    const tdRight = document.createElement('td');
    const tdRightDiv = document.createElement('div');
    for (const [sumptKey, powerBucket] of energyBucket) {
      if (sumptKey <= 6 * lcmTurns) continue;

      if (sumptKey - lastSumpt > lcmTurns / 3) {
        tdRightDiv.append(makeSpacerDom((sumptKey - lastSumpt) * 6 / lcmTurns - 2));
      }

      const pptDiv = document.createElement('div');
      pptDiv.classList.add('ppt-container');
      const pptLabelDiv = document.createElement('div');
      pptLabelDiv.append(`${toLocaleFixed((sumptKey - eptKey) / lcmTurns, 2)} ppt`);
      pptDiv.prepend(pptLabelDiv);
      for (const [turns, turnBucket] of powerBucket) {
        const turnElem = moveListToDom(turns, eptKey / (lcmTurns / turns), (sumptKey - eptKey) / (lcmTurns / turns), turnBucket);
        pptDiv.append(turnElem);
      }

      tdRightDiv.append(pptDiv);
      lastSumpt = sumptKey;
    }
    if (maxSumpt > lastSumpt) {
      tdRightDiv.append(makeSpacerDom((maxSumpt - lastSumpt) * 6 / lcmTurns));
    }
    tdRight.append(tdRightDiv);
    tr.append(tdRight);

    tbody.append(tr);
  }
  table.append(tbody);
  return table;
}

async function main() {
  const gm = await updateGm();
  const moves = sortGroupedMoves(groupFastMoves(gm));

  const table = toDom(moves);

  const seasonSettings = gm.find(x => 'combatCompetitiveSeasonSettings' in x).combatCompetitiveSeasonSettings;
  const seasonEndTimestamps = seasonSettings.seasonEndTimeTimestamp;
  const gmTimestamp = await getTimestamp();

  if (document.readyState !== 'loading') {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }

  function init() {
    const root = document.getElementById('moves-container');
    const oldTable = root.querySelector('table');

    const tableCaption = root.querySelector('caption');
    if (tableCaption) table.prepend(tableCaption);

    const currentSeasonCaption = document.getElementById('current-season');
    removeAllChildren(currentSeasonCaption);
    currentSeasonCaption.append(`GBL Season ${seasonEndTimestamps.length - 3}`);

    oldTable?.remove();
    root.append(table);

    const lastUpdated = document.getElementById('last-updated');
    const intlOptions = { dateStyle: 'medium', timeStyle: 'short' };
    removeAllChildren(lastUpdated);
    lastUpdated.append(new Date(+gmTimestamp).toLocaleString(undefined, intlOptions));

    const currentSeasonEndTimestamp = seasonEndTimestamps[seasonEndTimestamps.length - 2];
    const currentSeasonEnd = document.getElementById('current-season-end');
    removeAllChildren(currentSeasonEnd);
    currentSeasonEnd.append(new Date(+currentSeasonEndTimestamp).toLocaleString(undefined, intlOptions));

    window.fastMoves = moves; // debug
  }
}

main();
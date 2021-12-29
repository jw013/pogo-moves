import { updateGm, getTimestamp, getAllTeachableMoves } from './gm.js';
import { sortMapByKeys, numericCompare, descendingNumericCompare, toLocaleFixed, removeAllChildren } from './utils.js';

// to avoid using floats as map keys, all per-turn values are scaled up to integers
// 3 * 4 * 5 = 60; If a 7+ turn move is released this will need to be updated
const lcmTurns = 60;

const excludedFastMoves = new Set([
  'WATER_GUN_FAST_BLASTOISE'
])

// Map ept => Map ppt => Map turns => [moves]
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
    const pptKey = power * lcmTurns / turns;

    const energyBucket = moves.get(eptKey) ?? new Map();
    const powerBucket = energyBucket.get(pptKey) ?? new Map();
    const turnBucket = powerBucket.get(turns) ?? [];
    turnBucket.push(combatMove);
    powerBucket.set(turns, turnBucket);
    energyBucket.set(pptKey, powerBucket);
    moves.set(eptKey, energyBucket);
  }
  return moves;
}

function sortGroupedMoves(moves) {
  for (const [eptKey, energyBucket] of moves) {
    for (const [pptKey, powerBucket] of energyBucket) {
      for (const turnBucket of powerBucket.values()) {
        // equality should not occur in source data, no need to handle
        turnBucket.sort((a, b) => a.uniqueId > b.uniqueId ? 1 : -1);
      }
      energyBucket.set(pptKey, sortMapByKeys(powerBucket, numericCompare))
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

function moveListTodom(turns, energy, power, moves) {
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

  for (const [eptKey, energyBucket] of groupedMoves) {
    const tr = document.createElement('tr');

    const th = document.createElement('th');
    th.scope = 'row';
    const thDiv = document.createElement('div');
    thDiv.append(`${toLocaleFixed(eptKey / lcmTurns, 2)} ept`);

    th.append(thDiv);
    tr.append(th);

    let lastPpt = undefined;

    const tdLeft = document.createElement('td');
    const tdLeftDiv = document.createElement('div');
    for (const [pptKey, powerBucket] of energyBucket) {
      if (pptKey + eptKey >= 6 * lcmTurns) break;

      if (lastPpt !== undefined && pptKey - lastPpt > lcmTurns / 3) {
        const spacerDiv = document.createElement('div');
        spacerDiv.setAttribute('data-spacer-units', (pptKey - lastPpt) / 10 - 2);
        tdLeftDiv.append(spacerDiv);
      }

      const pptDiv = document.createElement('div');
      for (const [turns, turnBucket] of powerBucket) {
        const turnElem = moveListTodom(turns, eptKey / (lcmTurns / turns), pptKey / (lcmTurns / turns), turnBucket);
        pptDiv.append(turnElem);
      }
      tdLeftDiv.append(pptDiv);
      lastPpt = pptKey;
    }
    const midPpt = 6 * lcmTurns - eptKey;
    if (lastPpt !== undefined && midPpt - lastPpt > lcmTurns / 3) {
      const spacerDiv = document.createElement('div');
      spacerDiv.setAttribute('data-spacer-units', (midPpt - lastPpt) / 10 - 2);
      tdLeftDiv.append(spacerDiv);
    }
    tdLeft.append(tdLeftDiv);
    tr.append(tdLeft);

    const tdMid = document.createElement('td');
    const tdMidDiv = document.createElement('div');
    for (const [pptKey, powerBucket] of energyBucket) {
      if (pptKey + eptKey < 6 * lcmTurns) continue;
      if (pptKey + eptKey > 6 * lcmTurns) break;

      for (const [turns, turnBucket] of powerBucket) {
        const turnElem = moveListTodom(turns, eptKey / (lcmTurns / turns), pptKey / (lcmTurns / turns), turnBucket);
        tdMidDiv.append(turnElem);
      }
    }
    tdMid.append(tdMidDiv);
    tr.append(tdMid);

    lastPpt = 6 * lcmTurns - eptKey;
    const tdRight = document.createElement('td');
    const tdRightDiv = document.createElement('div');
    for (const [pptKey, powerBucket] of energyBucket) {
      if (pptKey + eptKey <= 6 * lcmTurns) continue;

      if (pptKey - lastPpt > lcmTurns / 3) {
        const spacerDiv = document.createElement('div');
        spacerDiv.setAttribute('data-spacer-units', (pptKey - lastPpt) / 10 - 2);
        tdRightDiv.append(spacerDiv);
      }

      const pptDiv = document.createElement('div');
      for (const [turns, turnBucket] of powerBucket) {
        const turnElem = moveListTodom(turns, eptKey / (lcmTurns / turns), pptKey / (lcmTurns / turns), turnBucket);
        pptDiv.append(turnElem);
      }
      tdRightDiv.append(pptDiv);
      lastPpt = pptKey;
    }
    tdRight.append(tdRightDiv);
    tr.append(tdRight);

    table.append(tr);
  }
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

    const currentSeasonCaption = table.querySelector('.season-caption');
    removeAllChildren(currentSeasonCaption);
    // \u2014 = &mdash;
    currentSeasonCaption.append(` \u2014 GBL Season ${seasonEndTimestamps.length - 3}`);

    oldTable?.remove();
    root.prepend(table);

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
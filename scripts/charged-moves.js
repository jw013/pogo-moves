import { updateGm, getTimestamp, getAllTeachableMoves, getSeasonDescription } from './gm.js';
import { sortMapByKeys, numericCompare, removeAllChildren, toLocaleFixed } from './utils.js';

// moves in GM but not usable
const excludedChargeMoves = new Set([
	'HYDRO_PUMP_BLASTOISE',
	'SCALD_BLASTOISE',
	'WRAP_GREEN',
	'WRAP_PINK',
	'MEGA_DRAIN',
	'GIGA_DRAIN',
	'HEART_STAMP',
	'REST'
]);

// subdivide first by energyDelta, then by power
// Map energyDelta => Map power => [moves]
function groupChargedMoves(gm) {
	const seenMoves = getAllTeachableMoves(gm);
	const moves = new Map();
	for (const { combatMove } of gm) {
		if (combatMove === undefined) continue;
		if (excludedChargeMoves.has(combatMove.uniqueId)) {
			// TM-able moves override the exclude list for future-proofing
			if (seenMoves.has(combatMove.uniqueId)) {
				console.warn('Found excluded move in use: "%s"', combatMove.uniqueId);
			} else {
				continue;
			}
		}

		const { energyDelta, power } = combatMove;

		if (!(energyDelta < 0)) continue; // also handles undefined case, not that any currently exist

		const energyBucket = moves.get(-energyDelta) ?? new Map();
		const powerBucket = energyBucket.get(power) ?? [];
		powerBucket.push(combatMove);
		energyBucket.set(power, powerBucket);
		moves.set(-energyDelta, energyBucket);
	}
	return moves;
}

function sortGroupedMoves(moves) {
	for (const [energy, energyBucket] of moves) {
		for (const powerBucket of energyBucket.values()) {
			if (powerBucket === undefined) continue;
			// equality should not occur in source data, no need to handle
			powerBucket.sort((a, b) => a.uniqueId > b.uniqueId ? 1 : -1);
		}
		moves.set(energy, sortMapByKeys(energyBucket, numericCompare));
	}
	return sortMapByKeys(moves, numericCompare);
}

const moveNames = {
	'POWER_UP_PUNCH': 'Power-Up Punch',
	'V_CREATE': 'V-create',
	'X_SCISSOR': 'X-Scissor',
	'TECHNO_BLAST_NORMAL': 'Techno Blast',
	'TECHNO_BLAST_BURN': 'Techno Blast',
	'TECHNO_BLAST_CHILL': 'Techno Blast',
	'TECHNO_BLAST_WATER': 'Techno Blast',
	'TECHNO_BLAST_SHOCK': 'Techno Blast',
	'WEATHER_BALL_NORMAL': 'Weather Ball',
	'WEATHER_BALL_FIRE': 'Weather Ball',
	'WEATHER_BALL_ICE': 'Weather Ball',
	'WEATHER_BALL_ROCK': 'Weather Ball',
	'WEATHER_BALL_WATER': 'Weather Ball',
	'SACRED_FIRE_PLUS': 'Sacred Fire+',
	'SACRED_FIRE_PLUS_PLUS': 'Sacred Fire++',
	'AEROBLAST_PLUS': 'Aeroblast+',
	'AEROBLAST_PLUS_PLUS': 'Aeroblast++'
};

function moveIdtoTitle(id) {
	return moveNames[id] ?? id.split('_')
			.map(s => s[0].toUpperCase() + s.substring(1).toLowerCase())
			.join(' ');
}

function moveListToDom(power, moves) {
	// spacer for empty bucket
	if (moves === undefined || moves.length === 0) {
		return document.createElement('div');
	}

	const container = document.createElement('figure');
	const powerCaption = document.createElement('figcaption');
	powerCaption.append(`${power} power`);

	const moveList = document.createElement('ul');
	for (const move of moves) {
		const li = document.createElement('li');
		const name = document.createElement('p');
		name.append(moveIdtoTitle(move.uniqueId));
		const typeImg = document.createElement('img');
		const type = move.type.substring(13).toLowerCase();
		typeImg.src = `images/type-icons.svg#${type}-badge`
		typeImg.alt = `${type}`;

		li.append(name, typeImg);
		moveList.append(li);

		// buffs
		if (!move.buffs) continue;
		const nbsp = '\xA0';
		const buffs = document.createElement('p');
		if (move.buffs.buffActivationChance !== 1) { // omit 100% to save space
			buffs.append(`${move.buffs.buffActivationChance * 100}% `);
		}
		const helpfulBuffStart = '\u{1f496}' // sparkling heart
		let helpfulBuffs = helpfulBuffStart;
		if (move.buffs.attackerAttackStatStageChange > 0) {
			helpfulBuffs += `${nbsp}A+${move.buffs.attackerAttackStatStageChange}`;
		}
		if (move.buffs.attackerDefenseStatStageChange > 0) {
			helpfulBuffs += `${nbsp}D+${move.buffs.attackerDefenseStatStageChange}`;
		}
		if (move.buffs.targetAttackStatStageChange < 0) {
			helpfulBuffs += `${nbsp}A${move.buffs.targetAttackStatStageChange}`;
		}
		if (move.buffs.targetDefenseStatStageChange < 0) {
			helpfulBuffs += `${nbsp}D${move.buffs.targetDefenseStatStageChange}`;
		}
		if (helpfulBuffs.length > helpfulBuffStart.length) {
			buffs.append(helpfulBuffs);
		}
		const hurtfulBuffStart = '\u{1f4a3}' // bomb
		let hurtfulBuffs = hurtfulBuffStart;
		if (move.buffs.attackerAttackStatStageChange < 0) {
			hurtfulBuffs += `${nbsp}A${move.buffs.attackerAttackStatStageChange}`;
		}
		if (move.buffs.attackerDefenseStatStageChange < 0) {
			hurtfulBuffs += `${nbsp}D${move.buffs.attackerDefenseStatStageChange}`;
		}
		if (move.buffs.targetAttackStatStageChange > 0) {
			hurtfulBuffs += `${nbsp}A+${move.buffs.targetAttackStatStageChange}`;
		}
		if (move.buffs.targetDefenseStatStageChange > 0) {
			hurtfulBuffs += `${nbsp}D+${move.buffs.targetDefenseStatStageChange}`;
		}
		if (hurtfulBuffs.length > hurtfulBuffStart.length) {
			buffs.append(hurtfulBuffs);
		}
		// Note: a move with both helpful and hurtful buffs may need an
		// extra space. At this time no such moves exist.
		li.append(buffs);
	}

	container.append(powerCaption, moveList);
	return container;
}

/**
 * <table>
 *   <tr>
 *     <th><div>45 Energy</div></th>
 *     <td><div> moves < 1.0 DPE ...</div></td>
 *     <td><div> 1.0 DPE <= moves <= 2.0 DPE ...</div></td>
 *     <td><div> moves > 2.0 DPE ...</div></td>
 *   </tr>
 * </table>
 */
function toDom(groupedMoves) {
	let minPpe = 1; // this is the minimum we care to display a scale for
	let maxPpe = 2;
	for (const [energy, energyBucket] of groupedMoves) {
		const pKeys = Array.from(energyBucket.keys());
		if (pKeys.length && maxPpe < pKeys[pKeys.length - 1] / energy) maxPpe = pKeys[pKeys.length - 1] / energy;
	}
	const logScaleFactor = 1 / Math.log(maxPpe / minPpe);
	function scaleLog(ppe) {
		return Math.log(ppe / minPpe) * logScaleFactor;
	}

	const table = document.createElement('table');
	const tbody = document.createElement('tbody');

	for (const [energy, energyBucket] of groupedMoves) {
		const moveRow = document.createElement('tr');

		const energyDiv = document.createElement('div');
		energyDiv.append(`${energy} energy`);

		const th = document.createElement('th');
		th.scope = 'row';
		th.rowSpan = 2;

		th.appendChild(energyDiv);
		moveRow.appendChild(th);

		const lowEffTd = document.createElement('td');
		const lowEffDiv = document.createElement('div');
		for (const [power, powerBucket] of energyBucket) {
			if (power >= energy) break;

			const elem = moveListToDom(power, powerBucket);
			lowEffDiv.append(elem);
		}
		lowEffTd.append(lowEffDiv);

		const middleTd = document.createElement('td');
		const middleDiv = document.createElement('div');
		// include empty spacers for power values from [1 * energy, 2 * energy]
		// this assumption that all charge move powers are multiples of 5 is
		// core to the layout algorithm of this middle column due the use of unit div spacers
		for (let power = energy; power <= energy * 2; power += 5) {
			const elem = moveListToDom(power, energyBucket.get(power));
			middleDiv.append(elem);
		}

		middleTd.append(middleDiv);

		const highEffTd = document.createElement('td');
		const highEffDiv = document.createElement('div');
		for (const [power, powerBucket] of energyBucket) {
			if (power <= energy * 2) continue;

			const elem = moveListToDom(power, powerBucket);
			highEffDiv.append(elem);
		}
		highEffTd.append(highEffDiv);

		moveRow.append(lowEffTd, middleTd, highEffTd);
		tbody.append(moveRow);

		const ppeScaleRow = document.createElement('tr');
		ppeScaleRow.classList.add('scale');

		const scaleTh = document.createElement('th');
		scaleTh.scope = 'row';
		const scaleHeadDiv = document.createElement('div');
		scaleHeadDiv.append('(log scale) ppe');
		scaleTh.append(scaleHeadDiv);
		ppeScaleRow.append(scaleTh);

		const scaleCell = document.createElement('td');
		scaleCell.colSpan = 2;
		const scaleContainer = document.createElement('div');
		let lastPower = -1;
		for (const power of energyBucket.keys()) {
			if (power / energy < minPpe) continue;
			const segment = document.createElement('div');
			if (lastPower > 0) {
				segment.style.setProperty('--width', scaleLog(power / energy) - scaleLog(lastPower / energy));
				const textContainer = document.createElement('p');
				textContainer.append(`${toLocaleFixed(lastPower / energy, 2)}`);
				segment.append(textContainer);
			} else {
				segment.style.setProperty('--width', scaleLog(power / energy));
			}
			if (power / energy > minPpe)
				scaleContainer.append(segment);
			lastPower = power;
		}
		const lastScaleSegment = document.createElement('div');
		if (lastPower > 0) {
			lastScaleSegment.style.setProperty('--width', 1 - scaleLog(lastPower / energy));
			const textContainer = document.createElement('p');
			textContainer.append(`${toLocaleFixed(lastPower / energy, 2)}`);
			lastScaleSegment.append(textContainer);
		} else {
			lastScaleSegment.style.setProperty('--width', 1);
		}
		scaleContainer.append(lastScaleSegment);

		scaleCell.append(scaleContainer);
		ppeScaleRow.append(scaleCell);
		tbody.append(ppeScaleRow);
	}

	table.append(tbody);
	return table;
}

async function main() {
	const gm = await updateGm();
	const moves = sortGroupedMoves(groupChargedMoves(gm));
	const table = toDom(moves);
	const seasonEndTimestamps = gm.find(x => 'combatCompetitiveSeasonSettings' in x).combatCompetitiveSeasonSettings.seasonEndTimeTimestamp.map(x => new Date(Number(x)));
	const gmTimestamp = await getTimestamp();

	if (document.readyState !== 'loading') {
		init();
	} else {
		document.addEventListener('DOMContentLoaded', init);
	}

	function init() {
		const root = document.getElementById('moves-container');
		const oldTable = root.querySelector('table');

		const thead = oldTable.querySelector('thead');
		if (thead) table.prepend(thead);

		const tableCaption = oldTable.querySelector('caption');
		if (tableCaption) table.prepend(tableCaption);
		// note: HTML5 requires caption be table's first child

		const currentSeason = document.getElementById('current-season');
		removeAllChildren(currentSeason);
		currentSeason.append(`GBL Season ${getSeasonDescription(seasonEndTimestamps)}`);

		oldTable?.remove();
		root.append(table);

		const lastUpdated = document.getElementById('last-updated');
		const intlOptions = { dateStyle: 'medium', timeStyle: 'short' };
		removeAllChildren(lastUpdated);
		lastUpdated.append(new Date(+gmTimestamp).toLocaleString(undefined, intlOptions));

		const now = Date.now();
		const currentSeasonEndTimestamp = seasonEndTimestamps.find(x => x > now);
		const currentSeasonEnd = document.getElementById('current-season-end');
		removeAllChildren(currentSeasonEnd);
		currentSeasonEnd.append(new Date(+currentSeasonEndTimestamp).toLocaleString(undefined, intlOptions));

		window.chargedMoves = moves; // debug, remove when no longer needed
	}
}

main();

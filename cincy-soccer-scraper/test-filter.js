const assert = require('assert');
const { parseTournamentArgs } = require('./tournamentFilter.js');

console.log("🧪 Testing tournamentFilter.js argument parser...");

// Test 1: Empty args returns all tournaments
const test1 = parseTournamentArgs([]);
assert.strictEqual(test1.isList, false);
assert.strictEqual(test1.matchedTournaments.length, 4);
console.log("  ✅ Test 1 Passed: Empty args returns all 4 tournaments.");

// Test 2: Substring match 'party'
const test2 = parseTournamentArgs(['party']);
assert.strictEqual(test2.matchedTournaments.length, 1);
assert.strictEqual(test2.matchedTournaments[0].id, 'party-on-the-pitch-2026');
console.log("  ✅ Test 2 Passed: 'party' matches 'party-on-the-pitch-2026'.");

// Test 3: Substring match 'summer'
const test3 = parseTournamentArgs(['summer']);
assert.strictEqual(test3.matchedTournaments.length, 1);
assert.strictEqual(test3.matchedTournaments[0].id, 'summer-end-showdown-2026');
console.log("  ✅ Test 3 Passed: 'summer' matches 'summer-end-showdown-2026'.");

// Test 4: Comma-separated match 'summer,kickoff'
const test4 = parseTournamentArgs(['summer,kickoff']);
assert.strictEqual(test4.matchedTournaments.length, 2);
const ids4 = test4.matchedTournaments.map(t => t.id);
assert.ok(ids4.includes('summer-end-showdown-2026'));
assert.ok(ids4.includes('community-kickoff-2026'));
console.log("  ✅ Test 4 Passed: 'summer,kickoff' matches 2 tournaments.");

// Test 5: Flag syntax '--tournament=party-on-the-pitch-2026'
const test5 = parseTournamentArgs(['--tournament=party-on-the-pitch-2026']);
assert.strictEqual(test5.matchedTournaments.length, 1);
assert.strictEqual(test5.matchedTournaments[0].id, 'party-on-the-pitch-2026');
console.log("  ✅ Test 5 Passed: Flag '--tournament=...' matches correctly.");

// Test 6: List flag '--list'
const test6 = parseTournamentArgs(['--list']);
assert.strictEqual(test6.isList, true);
console.log("  ✅ Test 6 Passed: '--list' detected correctly.");

console.log("\n🎉 All 6 tournamentFilter tests passed successfully!");

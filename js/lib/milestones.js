// Milestones — list of badges earned from the data history.
// Computed client-side from bouts + sessions + lessons.

export const MILESTONES = [
    { id: 'first-bout',     icon: '🎯', name: 'First Bout',       test: d => (d.bouts||[]).length >= 1 },
    { id: 'first-win',      icon: '⚔️', name: 'First Win',        test: d => (d.bouts||[]).some(b => b.outcome === 'win') },
    { id: 'three-win',      icon: '🏆', name: 'Three Wins',       test: d => (d.bouts||[]).filter(b => b.outcome === 'win').length >= 3 },
    { id: 'win-against-A',  icon: '👑', name: 'Slayer (beat A)',  test: d => (d.bouts||[]).some(b => b.outcome === 'win' && /^A\d{2}$/i.test(b.opponent_rating || '')) },
    { id: 'comeback',       icon: '💪', name: 'Comeback Kid',     test: d => (d.bouts||[]).some(b => b.outcome === 'win' && (b.my_score - b.their_score) <= 1) },
    { id: 'first-reflection', icon: '📝', name: 'Mindful Fencer',  test: d => (d.bouts||[]).some(b => b.reflection && b.reflection.trim().length > 10) },
    { id: 'first-swot',     icon: '🔍', name: 'Scout I',          test: d => (d.opponent_swots||[]).some(s => (s.strengths||[]).length + (s.weaknesses||[]).length + (s.opportunities||[]).length + (s.threats||[]).length >= 1) },
    { id: 'full-swot',      icon: '🕵️', name: 'Master Scout',     test: d => (d.opponent_swots||[]).filter(s => (s.strengths||[]).length >= 2 && (s.weaknesses||[]).length >= 2 && (s.opportunities||[]).length >= 2 && (s.threats||[]).length >= 2).length >= 1 },
    { id: 'phys-streak',    icon: '⚡', name: '5-day Body',       test: d => { const days = new Set((d.physical_sessions||[]).map(s => s.date)); return days.size >= 5; } },
    { id: 'first-lesson',   icon: '🎓', name: 'Coached',          test: d => ((d.private_lessons||[]).length + (d.group_lessons||[]).length) >= 1 },
    { id: 'mastery-8',      icon: '⭐', name: 'Mastered a Topic', test: d => [...(d.private_lessons||[]), ...(d.group_lessons||[])].some(l => (l.topics||[]).some(t => (t.mastery_1_10||0) >= 8)) },
    { id: 'reps-1000',      icon: '🔥', name: '1,000 Reps',       test: d => { let n=0; for (const s of (d.physical_sessions||[])) for (const x of (s.drills_completed||[])) n += (x.actual_reps||0); return n >= 1000; } },
    { id: 'reps-5000',      icon: '💎', name: '5,000 Reps',       test: d => { let n=0; for (const s of (d.physical_sessions||[])) for (const x of (s.drills_completed||[])) n += (x.actual_reps||0); return n >= 5000; } }
];

export function earnedMilestones(data) {
    return MILESTONES.filter(m => { try { return m.test(data); } catch (e) { return false; } });
}

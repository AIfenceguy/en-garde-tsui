// Coach review — real AI coaching over the fencer's own log.
//
// Calls the `coach` Edge Function, which holds the Anthropic key server-side
// (it cannot ship in a static site) and runs the query as the signed-in user,
// so a fencer can only ever generate coaching from their own entries.
//
// Every review is kept in coach_notes, so a fencer can look back at what they
// were told a month ago and see whether they acted on it.

import { el, fmtDate, toast } from '../lib/util.js';
import { supa } from '../lib/supa.js';
import { activeProfile } from '../lib/state.js';

const INK = 'var(--ink, #1A1D24)';
// Literal, not var(--ink-mute): that token composites to ~3.1:1 on white.
const INK_MUTE = '#6B7280';

// The model returns plain prose with blank-line paragraphs; render that
// faithfully rather than collapsing it into one wall of text.
function paragraphs(text) {
    return String(text || '')
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => el('p', {
            style: { color: INK, fontSize: '15px', lineHeight: '1.65', margin: '0 0 12px' }
        }, [p]));
}

export async function renderCoachReview(container) {
    const profile = activeProfile();
    container.innerHTML = '';
    if (!profile) {
        container.appendChild(el('div', { class: 'empty' }, ['Pick a profile.']));
        return;
    }

    container.appendChild(el('p', { style: { color: INK_MUTE, fontSize: '14px', margin: '0 0 12px' } }, [
        'A coach read of everything you have logged — lessons, videos, and how you rate yourself.'
    ]));

    const btn = el('button', { class: 'btn btn-primary btn-mono-label', style: { width: '100%' } }, ['Get a coach review']);
    const out = el('div', {});
    container.appendChild(btn);
    container.appendChild(out);

    // Show the most recent review immediately, so the screen is never empty.
    const { data: past } = await supa
        .from('coach_notes')
        .select('response_text, created_at, input_summary')
        .eq('profile_id', profile.id)
        .eq('kind', 'lesson-review')
        .order('created_at', { ascending: false })
        .limit(5);

    function renderNotes(notes) {
        out.innerHTML = '';
        if (!notes?.length) {
            out.appendChild(el('div', { class: 'empty', style: { marginTop: '16px' } }, [
                'No review yet. Log a few lessons first, then ask.'
            ]));
            return;
        }
        notes.forEach((n, i) => {
            const card = el('div', { class: 'card', style: { marginTop: '12px' } });
            card.appendChild(el('div', { class: 'kicker', style: { color: INK_MUTE } }, [
                i === 0 ? 'Latest review' : fmtDate(String(n.created_at).slice(0, 10))
            ]));
            if (i === 0) {
                const s = n.input_summary || {};
                card.appendChild(el('div', { style: { color: INK_MUTE, fontSize: '12px', marginBottom: '10px' } }, [
                    `${fmtDate(String(n.created_at).slice(0, 10))} · from ${s.private_lessons ?? 0} lesson(s), ${s.videos ?? 0} video(s)`
                ]));
                paragraphs(n.response_text).forEach((p) => card.appendChild(p));
            } else {
                // Older reviews collapsed - the point is to be able to look back,
                // not to scroll past four of them to reach today's.
                const body = el('div', { style: { display: 'none', marginTop: '8px' } }, paragraphs(n.response_text));
                const chev = el('span', { style: { marginRight: '6px', fontSize: '10px', color: INK_MUTE } }, ['▶']);
                card.appendChild(el('button', {
                    type: 'button',
                    style: {
                        background: 'transparent', border: 'none', padding: '4px 0', cursor: 'pointer',
                        fontFamily: 'var(--eg-mono, monospace)', fontSize: '11px', fontWeight: '700',
                        letterSpacing: '0.08em', textTransform: 'uppercase', color: INK_MUTE,
                        display: 'inline-flex', alignItems: 'center'
                    },
                    onclick: () => {
                        const open = body.style.display !== 'none';
                        body.style.display = open ? 'none' : 'block';
                        chev.style.transform = open ? 'rotate(0deg)' : 'rotate(90deg)';
                    }
                }, [chev, 'Read this one']));
                card.appendChild(body);
            }
            out.appendChild(card);
        });
    }
    renderNotes(past);

    btn.onclick = async () => {
        btn.disabled = true;
        btn.textContent = 'Reading your log…';
        try {
            const { data, error } = await supa.functions.invoke('coach', {
                body: { profile_id: profile.id }
            });
            if (error) throw error;
            if (data?.error) throw new Error(data.error);

            toast('Coach review ready');
            const { data: fresh } = await supa
                .from('coach_notes')
                .select('response_text, created_at, input_summary')
                .eq('profile_id', profile.id)
                .eq('kind', 'lesson-review')
                .order('created_at', { ascending: false })
                .limit(5);
            renderNotes(fresh);
        } catch (e) {
            toast('Could not get a review: ' + (e.message || e), 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Get a coach review';
        }
    };
}

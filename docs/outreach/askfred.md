# Draft: asking AskFRED for a commercial arrangement (written 2026-09-10)

Why AskFRED first: it is a company with a published developer program (askfred.net/developers),
a public-beta REST API and MCP server, OAuth2 "Connect to AskFRED" for registered third-party
apps, and a stated process: free for personal and club use, and for anything commercial "ask
before you build: contact support and tell us what you have in mind". Its sister site 14meters
republishes all 36 USA Fencing national points lists daily. Nobody publishes a price; the price
is whatever this conversation produces.

**Where to send it.** support@askfred.net (their Contact page; 1 to 2 business days). Send from
the family Gmail (rtsui.jlconcepts). Ricky signs as a fencing parent and the tool's developer.

**Before sending, decide two things.** (1) The user-facing application name they will show on
the "Connect to AskFRED" screen. (2) The redirect URI, which must be HTTPS; the app's current
address on GitHub Pages carries the en-garde-tsui path, so a custom domain is needed if the
name should stay private. Fill in the brackets.

**After sending.** Keep the reply in this folder. Their written yes, with its conditions, is
the permission. Build the reader on the personal-use footing meanwhile (own record, calendar,
club season) and do not charge anyone until the yes is in hand.

---

**Subject:** Building a family season planner on the AskFRED API: permission, OAuth2 registration, and a data arrangement

Hello AskFRED team,

Your developer page asks people to say what they are building, so here it is. I am a fencing
parent in Southern California with two sons in foil, Y12 and Y14/Cadet, and over the past year
I built a web tool for our family: a training journal and a season planner. It works out which
tournaments are worth entering for a fencer's goals, how the national points add up, what each
trip will cost with flights and hotels, and it keeps the fencer's own bouts and opponents. Several
families at our club have asked to use it, and I would like to open it to them free this season.
If it earns its keep, I would like to offer it more widely as a paid family subscription next year.

I have read the developer terms: free for personal and club use, and express written permission
before anything commercial. I would like to do this properly, so I am asking for three things.

1. **OAuth2 registration for the app**, so each family connects its own AskFRED account and the
   tool reads only that family's record: profile, linked fencers with their USFA ids, events,
   bouts and tournaments. Application name: [App name]. Redirect URI: [https://.../callback].
   Nothing is written back; read-only is all it needs.

2. **Your permission, in writing, for the commercial use described above**, and what you would
   want for it: a fee, a revenue share, a per-user rate, or conditions such as attribution and
   caching. I would rather pay for a proper arrangement than build around one. For scale: tens
   of families this season, a few hundred if the paid version happens, each reading its own
   record on a schedule with your ETags honoured, plus the public tournament listings refreshed
   once a day on our side rather than per page view, well inside the published limits.

3. **Two questions about data I cannot get from the API today.** First, national standings: the
   tool shows each family its own fencer's rank and points and a few reference marks, never a
   list. 14meters carries the 36 lists daily. Could standings be exposed through the API, or may
   the tool read 14meters for that under the same permission? Second, official results of USA
   Fencing national events, which register outside AskFRED: do you hold them, and if not, is
   there a source you would point me to?

I am happy to share what the tool looks like, to report beta issues as I find them, and to
change anything about how it reads your data. Thank you for building the developer program.
It is the first door in the sport that opens.

Sincerely,

[Your name], fencing parent and the tool's developer
[Phone] · [Email]

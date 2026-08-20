# Released *Winds of Winter* witness registry v1

This component is a **repository-native public-metadata derivative** of the sealed `asoiaf-twow-released-material-registry-v0.1` component. The actors represented are George R. R. Martin as author and reader, publishers and app distributors as transmission actors, convention organizers and attendees as event witnesses, and bibliographic communities as bounded secondary indexes. The component records chapter identity, release or reading events, public source routes, version relations, and exact-witness acquisition holds. It contains no chapter prose, event transcript, attendee reconstruction, or holder-controlled payload.

The sealed parent archive remains identified at 18,639 bytes and SHA-256 `ac93ef471f05beb7e4ac1469baba4baca2d1550b246eb3b33ab50035c79333d0`, with replay receipt `4e14943fb5f57176b44ac96234dee96f35f44204175c0fb2e2189309b7f5bd8b`. Those bytes are not present. This component therefore has a new identity, does not claim parent byte reproduction, and cannot satisfy the parent component's `payloadMaterialized: false` hold.

The registry contains **11 distinct chapter identities, 16 release or reading events, 17 public source routes, 47 provenance or version relations, and 14 exact-witness acquisition holds**. The two Tyrion chapters, two Arianne chapters, and two Barristan chapters remain distinct objects. Event dates are separated from later report or publication dates where the evidence permits, including the March 12, 2012 TIFF appearance and its March 17 author-blog video route, plus the May 25–28 MisCon convention range and the June 3 archival report.

Martin's 2020 process statement controls version standing: material previously read at conventions or posted online may be revised, moved, combined, split, or reordered. Every recorded chapter is therefore mutable released-future material tied to a specific witness, not final-book text. Automatic canon promotion and graph mutation are both zero.

Run `PYTHONWARNINGS=error python verify.py` from this directory. The verifier checks exact counts, identifier uniqueness, reference integrity, parent non-impersonation, no-prose boundaries, date controls, chapter separation, relation law, hold law, and the internal checksum ledger.

The controlling question is whether a future edition, recording, app package, or archived web capture can be bound to an exact witness identity without allowing a rotating route, attendee transcription, or predecessor receipt to impersonate fixed author text.

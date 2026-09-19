GITHUB A2 FINAL REPLACEMENT PACKAGE

CROSS-CHECKED CURRENT FILES
- A1 data: 778 words — leave unchanged
- Old A2 data: 1214 words — REPLACE
- B1 data: 4069 words — leave unchanged
- Technical data: 1824 words — leave unchanged

FINAL A2
- 1,529 words
- 30 episodes
- 150 recall blocks
- 30 secure audio public IDs
- 1,529 entry_index records
- section value = "a2" so it does not get labeled "B1 Core" by the current frontend

FILES TO REPLACE IN GITHUB
1. /courses.js
2. /index.html
3. /sw.js
4. /courses/a2/data.js

FILES NOT TO REPLACE
- /courses/a1/data.js
- /courses/b1/data.js
- /courses/technical/data.js
- app.js
- styles.css
- site-config.js
- manifest.webmanifest

CHANGES
courses.js:
- A2 totalWords: 1214 -> 1529
- A2 episodes: 24 -> 30

index.html:
- courses.js cache-buster -> 20260919-a2final1
- visible app version -> 1.0.5
- updated date -> 19 September 2026
- app.js remains unchanged

sw.js:
- cache key bumped to german-vocab-audiobook-v1.0.8-a2final1
- courses.js cache URL aligned with index.html
- app.js precache URL aligned with index.html (sectiontoggle2)
- course data precache URLs changed to exact unversioned URLs requested by courses.js

Validation:
- JavaScript syntax: PASS
- Final A2 words: 1529
- Final A2 episodes: 30
- Final A2 unique audio route IDs: 30
- Final A2 recall blocks: 150
- Final A2 entry index records: 1529

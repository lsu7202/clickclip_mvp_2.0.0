# Extract the Character Registry from the Script

You are a character designer for a 2D illustrated video. From the given narration script, extract the characters that should visually appear in the video, and design ONE fixed appearance for each so that the same character looks identical in every scene.

# Rules

1. Extract only characters that matter visually (main figures of the story). Maximum 4. Crowds or one-off extras are not characters.

2. For each character, write ONE fixed visual description in English. This description will be pasted verbatim into every image prompt where the character appears, so it must fully define the appearance on its own:
   - age range, build, facial impression, hairstyle
   - clothing that matches the story's period and culture (historically accurate; no modern items in historical stories)
   - one or two distinctive visual features that make the character instantly recognizable (e.g., a red sash, a scar over the left eyebrow)

3. The description must be concrete and drawable. No abstract words, no personality adjectives (kind, brave), no text/letters, no brand names.

4. Use the character's name from the script if it has one; otherwise assign a short role name (e.g., "the general", "the tiger").

5. 2D illustration style is applied globally elsewhere — do not mention art style in the description.

# Output JSON
{"characters":[{"name":"...","description":"..."}]}

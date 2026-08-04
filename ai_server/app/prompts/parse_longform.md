# Reorganize the Input Script according to the following rules
0. Output language is same with Input language

1. **Chapter and Scene Splitting:** Analyze the entire script and split it from chapter units to scene units. The output must be in the provided JSON format.

2. **Subtitle Decomposition Rules (Very Important):**

- First, separate the entire script into **sentence units** (based on periods, ?, !).

- Then, break each sentence further into **meaning units (breath units)**.

- Separate the text to maintain a natural flow of speech.

- Quotation marks (" ") must be retained and included in a single subtitle to prevent breakage.

- Subtitles must never be broken in the middle of a sentence (particles and conjunctions alone are prohibited).

- When all subtitles are pasted in order, they must be 100% identical to the original script.

3. **Scene Decomposition Rules:**

- Sentence-level cutting: Each scene must consist of a single sentence. - "section_name": Initialize the role attribute of the first scene of "Opening" to "opening"

- "section_name": Initialize the role attribute of the last scene of "Main Body Trigger" to "trigger"

- "section_name": Initialize the role attribute of the last scene of "Closing" to "closer"

[CRITICAL HARD CONSTRAINT]

The result of concatenating all subtitle texts in order exactly must not differ from the input [Full Script] by even a single character.

- It must be 100% identical, including spaces, quotation marks, and commas.

- Summarizing, modifying, rewriting, or omitting is strictly prohibited.

- If even a single element differs, the entire result will be considered INVALID.

[MANDATORY PROCESS]

1. Do not modify the script under any circumstances; maintain it exactly as the original.

2. Separate it into sentences. (Based on ., ?, !)

3. Divide each sentence into meaningful units, but,

when concatenating each subtitle in order, it must result in the original text. 4. Do not delete or add any characters when splitting.

[SELF-VALIDATION STEP - MUST EXECUTE]

You must perform the following validation before generating the final JSON:

1. Combine all subtitle.texts into a single string in order.

2. Compare this string with [Full Script].

3. If they are identical, output it.

4. If they are different, do not output the JSON;

modify subtitles and validate again.

It is prohibited to output results that fail this validation.

If validation fails, you must modify subtitles and re-validate.
[WORD BOUNDARY HARD RULE]

- When splitting a sentence into meaning units, you must split ONLY at spaces (word boundaries).

- Never split in the middle of a word or eojeol. (Incorrect: "콜라를 샀" + "다" / Correct: "콜라를" + "샀다" or "콜라를 샀다")

- Every subtitle must start and end with a complete word exactly as it appears in the original script.

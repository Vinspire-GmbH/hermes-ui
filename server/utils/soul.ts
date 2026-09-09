/**
 * The interview that produces a SOUL.
 *
 * A persona document is prose, and prose is what a model is good at — so the
 * interview is conducted by a bot that is already wired up rather than by a
 * fixed list of form fields. The framing below is what turns an ordinary agent
 * into an interviewer: one question at a time, and a document only when it has
 * enough to write one.
 *
 * The marker is deliberately unusual. A model asked to "answer with the
 * document only" will still write a sentence in front of it now and then, and
 * a fence like ```markdown collides with the code blocks a SOUL legitimately
 * contains.
 */
export const SOUL_MARKER = '===SOUL==='

export function interviewBriefing(spec: {
  name: string
  role?: string
  language: 'en' | 'de'
}) {
  const language = spec.language === 'de' ? 'German' : 'English'
  return `You are conducting a short interview to write a SOUL.md — the persona
document a Hermes agent reads at the start of every single turn.

The agent being described is called "${spec.name}"${spec.role ? `, whose job is: ${spec.role}` : ''}.

How to run this:

- Ask exactly ONE question per turn, in ${language}. No preamble, no summary of
  what was said before, no numbered list of everything still to come.
- Ask about what actually changes the agent's behaviour: what it is responsible
  for and what it must leave alone, whose word counts, which tools it has, what
  it must never do unasked, what its output should look like, what it should
  remember between runs.
- Do not ask about anything you can infer. Six to nine questions is a good
  interview; twelve is an interrogation.
- If an answer is vague where it matters, ask once more. If it stays vague,
  write the document without that part rather than nagging.

When you have enough, stop asking and reply with exactly this shape:

${SOUL_MARKER}
<the complete SOUL.md, in ${language}, in Markdown>
${SOUL_MARKER}

Rules for the document itself:

- Write it as instructions addressed to the agent ("You are …", "You do …"),
  not as a description of it.
- Concrete beats comprehensive. Every sentence should be one an agent could
  actually violate — "be helpful" is not such a sentence.
- Name the tools it has and how they are called, if the interview turned any up.
- Include a short section on what it should remember, and what it should not:
  this document is in the context window on every turn, so its length has a
  running cost.
- No headline promises, no marketing voice, no emoji.

Begin now with your first question. Nothing else.`
}

/** Pull the document out of a reply, if the interview has reached that point. */
export function extractSoul(reply: string): string | null {
  const parts = reply.split(SOUL_MARKER)
  if (parts.length >= 3) {
    const doc = parts[1].trim()
    return doc.length > 40 ? doc : null
  }
  // Some models drop the closing marker. An opening one plus a substantial
  // body is still unambiguous enough to accept.
  if (parts.length === 2 && parts[1].trim().length > 200) return parts[1].trim()
  return null
}

/** Ask for the document now, whatever the interview has so far. */
export function generateNow(language: 'en' | 'de') {
  return `Stop asking questions. Write the SOUL.md now from what you already
know, in ${language === 'de' ? 'German' : 'English'}, and leave out anything the
interview did not establish rather than inventing it.

Reply with exactly this shape and nothing else:

${SOUL_MARKER}
<the complete SOUL.md>
${SOUL_MARKER}`
}

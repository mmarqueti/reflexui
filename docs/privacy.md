# Privacy

Conversations and reviews are the most useful signals and the most sensitive ones.

1. **Minimum data.** Owner/admin messages only, last N days, truncated. Not the assistant's replies.
2. **Remove personal data before sending.** Names, phones, emails, tax ids and addresses become placeholders.
3. **Zero-retention providers first.** Check your gateway's retention terms.
4. **Logs store anonymized state.** Set a retention period and restrict access.
5. **Tell the user.** Explain that the screen adapts to usage and conversations; offer the default screen.
6. **Never commit real data.** `replay-data/` is git-ignored; examples use fictitious fixtures only.
7. **Check your legal basis** (e.g. LGPD, GDPR) for using conversation history to personalize UI.

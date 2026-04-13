# Shopping Assistant (AI Chatbot)

A customer-facing chatbot that answers store questions using a curated business
knowledge guide. Built provider-agnostic — plug in Anthropic, OpenAI, or any
other chat-completion API without changing routes or UI.

---

## Architecture

```
Frontend (React)                   Backend (Express)                    Provider
───────────────                    ─────────────────                    ────────
AssistantWidget.jsx  ─── POST ─►   /api/assistant/chat  ─── HTTP ─►     Anthropic /
(Layout-mounted,                    │                                   OpenAI / …
 session-storage)                   ├─ services/assistantService.js
                                    │  • loads config/assistantPromptGuide.md
                                    │  • detects filled vs empty sections
                                    │  • refuses to answer when empty
                                    │  • dispatches to the configured provider
                                    └─ safe fallback reply on any error
```

## Files

| Path | Purpose |
|---|---|
| `config/assistantPromptGuide.md` | Business knowledge — **this is the file you fill** |
| `services/assistantService.js` | Guide loader, system-prompt builder, provider dispatch, fallback |
| `routes/assistant.js` | `POST /api/assistant/chat`, `GET /api/assistant/health` |
| `../ecommerce-website-frontend/src/components/assistant/AssistantWidget.jsx` | UI |

## Filling the knowledge guide

Open `config/assistantPromptGuide.md` and replace the `<!-- … -->` placeholders
under each section with real content. Restart the backend after editing — the
service reads the file once at first use and caches it.

**What counts as "filled":** a section must contain at least one non-comment,
non-blank line. Sections that only contain HTML comments are treated as empty
and the assistant refuses questions about that topic.

**Sections to fill:**
1. Brand overview
2. Store identity
3. Product categories
4. Important product facts
5. Delivery policy
6. Payment methods
7. Returns policy
8. FAQ
9. Contact & escalation
10. Brand tone of voice
11. What the assistant must NEVER invent
12. Out-of-scope questions
13. When to say "I don't know"
14. When to redirect to support

## Fallback behaviour

The assistant fails safely in three distinct modes:

| Situation | What the user sees |
|---|---|
| No `ASSISTANT_PROVIDER` / `ASSISTANT_API_KEY` / `ASSISTANT_MODEL` set | The static fallback reply: "L'assistant n'est pas encore disponible. Pour toute question, consultez notre FAQ (/faq) ou contactez-nous via /contact." |
| Provider configured but the guide is empty | The model is instructed it has **no verified business facts** and must refuse store-specific questions, redirecting to `/contact` / `/help` |
| Provider call throws (rate limit, network, bad key) | The static fallback reply is returned with `degraded: true` in the response payload; the error is logged server-side |

**Guarantee:** the backend never invents business facts. The system prompt
includes a strict rules block forbidding fabricated prices, stock, shipping
promises, refund guarantees, or medical claims. Anything not in the guide is
treated as unknown.

## Environment variables

Add to `ecommerce-website-backend/.env`:

```dotenv
# AI assistant (optional — widget falls back to a safe message when unset)
ASSISTANT_PROVIDER=anthropic          # anthropic | openai
ASSISTANT_API_KEY=sk-ant-...          # or sk-... for openai
ASSISTANT_MODEL=claude-haiku-4-5-20251001
# ASSISTANT_API_URL=                  # optional override (e.g. self-hosted proxy)
```

These are **not required** for the app to boot — the widget will just show the
fallback reply until they're set.

## Endpoints

### `POST /api/assistant/chat`
- **Auth:** public (no login required)
- **Rate limit:** `publicLimiter` (50 req / 15 min / IP)
- **Body:**
  ```json
  {
    "messages": [
      { "role": "user", "content": "Quels sont vos délais de livraison ?" }
    ]
  }
  ```
- **Response:**
  ```json
  {
    "success": true,
    "data": { "reply": "…", "configured": true, "degraded": false }
  }
  ```

### `GET /api/assistant/health`
Returns `{ configured: boolean, topics: string[] }`.

`topics` is the set of knowledge-guide sections that are actually filled in,
mapped to canonical keys the frontend understands:

| Topic key | Triggers on titles matching | Drives which suggestion chip is shown |
|---|---|---|
| `delivery` | delivery / shipping / livraison | "Délais de livraison" |
| `returns` | return / refund / retour / remboursement | "Retours et remboursements" |
| `payment` | payment / paiement | "Moyens de paiement" |
| `categories` | category / catégorie | "Catégories de produits" |
| `faq` | faq | "Questions fréquentes" |
| `brand` | brand / identity / overview / identité | "À propos de la marque" |

The widget shows a chip **only** for topics that appear in this list — so users
never see a suggestion the knowledge guide cannot answer. When the list is
empty, the widget shows a "limited mode" banner directing users to /faq and
/contact.

## Page context (for future product-aware replies)

The backend accepts an optional `context` object in `POST /api/assistant/chat`:

```json
{
  "messages": [...],
  "context": {
    "page": "product",
    "productId": "…",
    "productName": "…",
    "categorySlug": "…",
    "categoryName": "…"
  }
}
```

Only the whitelisted keys above are accepted, each trimmed to 200 characters.
The service renders them into a `CURRENT PAGE CONTEXT` block inside the system
prompt so the model can resolve references like *"this product"* — without
inventing any property of the product itself. Prices, stock, and descriptions
remain the live database's job.

**Frontend wiring** — pages that want to contribute context should read the
React context:

```jsx
import { useAssistantContext } from '@/contexts/AssistantContext';

useEffect(() => {
  setPageContext({ page: 'product', productId: id, productName: name });
  return () => clearPageContext();
}, [id, name]);
```

The widget reads the current context and attaches it to every `chat` call.
Nothing in the app calls `setPageContext` yet — the plumbing is ready for when
you want a product page to light up context-aware answers.

## Navigation links in replies

The assistant is instructed to refer to internal pages using Markdown-link
syntax with a human-readable label:

```
Vous pouvez consulter la page [Livraison](/shipping) pour voir les délais.
```

The frontend widget parses these into clickable navigation pills (React Router
`<Link>`), so users tap a labelled button instead of reading a raw URL. Bare
routes are also auto-linkified as a defence-in-depth if the model slips.

The canonical route→label map lives in two places and must stay in sync:

- Backend: `services/assistantService.js` → `PAGE_LABELS` (injected into the
  system prompt under "INTERNAL PAGE MAPPING").
- Frontend: `components/assistant/AssistantWidget.jsx` → `INTERNAL_PAGE_LABELS`
  (used by the renderer to build clickable pills).

Only routes that actually exist in `src/App.jsx` are listed. The renderer
ignores any other route so the widget never surfaces a broken link.

## Adding a new provider

Edit `services/assistantService.js` → `callProvider()` and add a branch for
your provider name. Nothing else needs to change.

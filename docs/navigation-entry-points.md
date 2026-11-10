# Navigation and authentication entry points

Owner: Huda Joad. Related issue: [#10](https://github.com/dishd123/StudyBoard/issues/10).

## Retained entry points

The Project 1 pages and Vite entry points remain in place. Navigation uses
ordinary links between pages; the App's Dashboard, Material, Notes, and Study
views continue to use local React state within `/app/`.

| Navigation label | URL | Existing entry file | Navigation implementation |
| --- | --- | --- | --- |
| Home / StudyBoard brand | `/` | `index.html` | `js/site.js` |
| About | `/about.html` | `about.html` | `js/site.js` |
| Contact | `/contact.html` | `contact.html` | `js/site.js` |
| App | `/app/` | `app/index.html` → `src/app/main.jsx` | `src/SiteNav.jsx` |
| Sign in | `/login/` | `login/index.html` → `src/login/main.jsx` | `src/SiteNav.jsx` |

Home's Explore the App link and the login page's Open app preview link both
open `/app/`. The `/index.html` alias also identifies Home as the current page.
Both navigation implementations have the accessible name Main navigation and
identify the current destination with `aria-current="page"`.

Bootstrap's existing collapsed menu is retained on narrow screens. The brand,
colors, images, typography, static-page content, and page purposes are retained.
The login page now shows one form at a time. A scoped CSS rule restores its
single-column mobile layout, which an older later rule had overridden. Another
small-screen rule matches the static pages' horizontal row gutters to their
container padding, fixing the 12-pixel overflow found on Home, About, and Contact.
No HTML entry file or build configuration needed changing for this issue.

## Authentication preview behavior

The sign-in page explicitly labels both forms as previews and asks for sample
values only. These controls prepare the UI for later Firebase Google sign-in;
they do not implement username/password authentication.

| Action | Current result |
| --- | --- |
| Submit an empty preview form | Native required-field validation prevents submission. |
| Submit sample login/password | Status says no authentication was performed; remains at `/login/`. |
| Create an account | Switches to the account preview and focuses its heading. |
| Back to sign in | Returns to the login form and focuses its heading. |
| Submit sample account details | Copies sample login/password to the login form and explicitly says no account was created. |
| Open app preview | Opens the public fixture workspace; does not imply authorization. |
| Refresh the login page | Resets form values and returns to the login preview. |

The forms use component state only. They do not call an authentication service,
send credentials, create a user, save an ID token, set an auth cookie, or write
to local/session storage. The status is announced through a live status region.
Keyboard focus is visible on navigation links, buttons, and form controls.

Firebase Google sign-in, token handling, protected API requests, authorized
domains, sign-out, and real access restrictions remain later authentication
issues, including #27. Those changes should replace the sample forms rather than
reuse their local values as authenticated identity. Google Photos authorization
also remains a separate integration. No cloud settings or secrets are needed
for this preview.

The existing Contact form is also a Project 1 local demonstration; its message
is not evidence of mail delivery. This issue verifies navigation to Contact,
not a working contact-message backend.

## Verification results — November 9, 2026

Codex ran the production build with Linux Node v22.23.2 and temporary browser
checks with headless Chrome through Playwright. The development server used
port 4175 and the production preview used 4176, leaving Huda's port 5173 alone.
Desktop was 1440 × 1000 and mobile was 390 × 844. The following checks passed
against both development and the built production preview:

| Check | Result |
| --- | --- |
| Direct load and reload of all five entry points, plus `/index.html` | HTTP success; navigation rendered after reload. |
| Follow Home → About → Contact → App → Sign in using actual links | Every link reached its expected URL. |
| Navigation destinations and current-page metadata | All five hrefs correct; exactly one current-page link per page. |
| Mobile collapsed menu on all five pages | Space opened it; expanded state and visible links were correct; links navigated. |
| Horizontal overflow on all five mobile pages | None after the static-page gutter fix. |
| Required fields and sample sign-in submission | Validation worked; explicit no-authentication status appeared. |
| Account switch, cancel, submission, and focus | One form visible; headings received focus; copied sample values and no-account status were correct. |
| Mobile account form | All four inputs fit the viewport without an inner scrolling form. |
| Login refresh | Sample login/password cleared. |
| Local/session storage, cookies, and form network submissions | No storage entries or cookies created; no non-GET requests observed in this workflow. |
| Open app preview | Dashboard heading rendered without suggesting that sign-in succeeded. |
| Browser runtime errors | None observed. |

`npm run build` and `git diff --check` passed. These are temporary smoke checks;
the committed frontend test suite remains issue #12 and the later cross-browser
work remains separate. This evidence does not establish real Firebase behavior.

Screenshots captured from the development build with synthetic values:

- [Desktop sign-in preview](images/issue-10-login-desktop.png).
- [Mobile navigation expanded](images/issue-10-nav-mobile.png).
- [Mobile account preview](images/issue-10-account-mobile.png).

## Huda's review checklist

Run `npm run dev` from the repository root and use its reported address
(normally `http://localhost:5173`).

1. Open Home, About, Contact, App, and Sign in using the site navigation.
2. Confirm the Project 1 design is recognizable and reload each page directly.
3. On Sign in, use sample values and confirm the submission claims no authentication.
4. Switch to Create an account, use sample values, submit, and confirm no account
   was created. Open app preview and confirm the fixture dashboard loads.
5. Use a narrow browser window or mobile emulation; open the navigation menu,
   follow its links, and check that the forms fit the width.
6. Tab through navigation and form controls; confirm visible focus and that
   switching forms moves focus to the new heading.

After this review, submit a dedicated PR with `Closes #10`. The automated checks
above were performed by Codex; Huda's manual review is a separate step.

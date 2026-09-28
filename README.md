# ICEPik

**A privacy-first, community-powered map for viewing and reporting ICE sightings.**

ICEPik helps immigrants move around their city safely by showing recent, community-reported ICE sightings on a map, and by letting anyone report a sighting anonymously.

> **Status: early development.** The first milestone is the login page and database on top of an OpenStreetMap map. Everything marked *planned* in this README is not built yet. See the [Roadmap](#roadmap).

---

## Table of Contents

- [Description](#description)
- [Features](#features)
- [Privacy Principles](#privacy-principles)
- [Usage](#usage)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)
- [Contact](#contact)
- [Acknowledgements](#acknowledgements)

---

## Description

### Who it's for

Immigrants who are afraid of ICE enforcement and racial profiling, and who want to get to school, work, or the grocery store without worrying about running into ICE agents.

### The problem

From our interviews and research, we found that fear of ICE changes how people live: they limit where they travel, stay out of sight, avoid officials, and share information with only a few trusted contacts. The workarounds people use today have real gaps:

- **Word of mouth and family group chats** are fast, but they are unverified, and people outside the circle never hear the news. Alerts can cause confusion, false alarms, and anxiety.
- **Local government resources** help with "Know Your Rights" education and language assistance, but they cannot stop federal ICE enforcement, and many people are too afraid to trust them.
- **General safety apps like Citizen** aren't focused on ICE, so ICE reports are rare. In our research we also found they can cause alert fatigue (alerts from far outside your area), require a paid subscription for most features, and raise privacy concerns for people who fear sharing their information.

### The solution

ICEPik is like Citizen, but **only for ICE sightings**. Picture this: someone is walking down the street and their phone buzzes. *An ICE sighting was reported two blocks away, four minutes ago.* They reroute and get to work safely. No more rumors or guessing.

### Why it's better than what exists

- **ICE-focused.** Every report on the map is about ICE, so there is no noise from unrelated incidents.
- **Anonymous by design.** Reporters use only a username and password. No real name, email, or phone number is required.
- **Verifiable information.** Sightings are marked *suspected* or *confirmed*, confirmed sightings need a photo or video, and the community votes on whether a report is true.
- **Built for real-world constraints.** It is a lightweight web app that works on older phones, with multiple languages and a guided first visit.
- **Free to use.**

### Background

ICEPik is being built by a student team at Launchpad Philly as part of the *Ignite: Turning Ideas Into Action* program, starting with immigrant communities in Philadelphia. It is planned as both a website and a mobile app.

---

## Features

| Priority | Feature | Status |
| --- | --- | --- |
| Top | **Map** built on OpenStreetMap | Planned |
| Top | **Sighting pins** that are either *suspected* or *confirmed* (confirmed requires an attached image or video) | Planned |
| Top | **Voting**: thumbs up / thumbs down on whether a sighting is true | Planned |
| Mid | **Local ICE news** people can follow | Planned |
| Mid | **Comment thread** on each sighting | Planned |
| Mid | **Translation** of the whole app and of each pin | Planned |
| Lower | **Notifications** (scoped to your area, to avoid alert fatigue) | Planned |
| Lower | **Sighting age** ("reported 4 minutes ago") | Planned |
| Lower | **Links to resources** for people who don't know how to handle an encounter with ICE | Planned |

Also in scope: username + password login, and the ability for a reporter to **edit their own posts**.

---

## Privacy Principles

Trust is the whole point of this project, so these principles guide every design decision:

- **Username + password only.** No real name, email address, or phone number is collected.
- **Anonymous reporters.** Reports are not tied to a real identity. We aim for zero logging of reporters.
- **Location is optional.** The app asks before using your location, and you can decline and browse the map manually.
- **Collect as little as possible.** If a feature needs personal data, we don't build it that way.
- **No tracking scripts.** Please don't add analytics, ad, or third-party tracking code to this project.

---

## Usage

This section describes the intended user experience. Items still being built are listed in the [Roadmap](#roadmap).

### Opening the app

1. **Choose your language.** On first open, the app asks which language you understand and walks you through a short tutorial. You can also tap the **translate button (bottom left)** at any time to translate everything, including the text on each pin, into your preferred language.
2. **Decide about location.** You'll be asked whether the app can use your location to show your surrounding area. You can say no and move the map yourself.

### Viewing sightings

- The map shows pins for recent sightings. If nobody has reported anything nearby, you'll see no pins.
- Tap a pin to see its details: the description, how long ago it was reported, and a photo or video if the reporter added one.
- Use the **pin color legend** to tell *suspected* sightings from *confirmed* ones.
- Give a **thumbs up or thumbs down** to say whether you think the sighting is true. This helps the community judge which reports to trust.

### Reporting a sighting

1. Log in with your username and password (or create an account: no real name, email, or phone number needed).
2. Tap the **+ button (bottom right)**.
3. Choose where the sighting was and mark it as **suspected** or **confirmed**. A *confirmed* sighting needs a photo or video attached.
4. Add a short description and submit.
5. Made a mistake? You can **edit your own post** later.

### Reporting guidelines

Good reports keep the community safe and the map trustworthy:

- Report only what you saw yourself, and only when it is safe to do so.
- **If you're not sure it's ICE** (and not local police or someone else), mark it *suspected*.
- Don't post anyone's personal information, including your own, and don't post anything that identifies or endangers a person.
- No harassment, threats, or calls for violence. Reports like that will be removed.
- Stay calm and don't interfere. The point is to help people avoid an area, not to confront anyone.

### Disclaimer

ICEPik is crowdsourced. Reports come from community members and **may be wrong, incomplete, or out of date**, so use your own judgment. ICEPik is not legal advice and is not affiliated with any government agency.

### Helpful resources

- [Immigrant Legal Resource Center (ILRC)](https://www.ilrc.org/): legal education and "Know Your Rights" materials
- [Immigrant Defense Project: ICE ruses](https://www.immigrantdefenseproject.org/ice-ruses/): how to recognize deceptive tactics and fake warrants
- [City of Philadelphia Office of Immigrant Affairs](https://www.phila.gov/departments/office-of-immigrant-affairs/resources/): language assistance, legal information, and public services

---

## Roadmap

- [ ] **Milestone 1 (in progress):** login page (username + password) and database, working end to end
- [ ] Map built on OpenStreetMap
- [ ] Report a sighting: suspected / confirmed pins, with image or video for confirmed
- [ ] Edit your own posts
- [ ] Voting on sightings (thumbs up / down)
- [ ] Translation (whole app and individual pins) and first-visit tutorial
- [ ] Comment threads on sightings
- [ ] Local ICE news
- [ ] Sighting age, area-scoped notifications, and links to resources
- [ ] Mobile app version

### How we'll know it's working

Our first goal is a small pilot in Philadelphia:

- At least **20 immigrants** test the app.
- At least **15** of them can view or anonymously report a sighting without any help.
- At least **80%** say the information is easy to understand and helps them feel more informed before traveling.

For ICEPik to keep growing, it needs regular participation from community members (a crowdsourced map is only as good as its reporters), partnerships with trusted immigrant organizations, multilingual support, and people with technical and privacy expertise.

---

## Contributing

Contributions are welcome, whether that's code, translations, design feedback, or testing with people who aren't tech-savvy.

### Ways to help

- **Report bugs or suggest features** by [opening an issue](https://github.com/nthanvii/icepik/issues).
- **Translate** the app into more languages.
- **Test** the app on older phones and with people who have low digital literacy, and tell us what got them stuck.
- **Write code** or improve the docs.

### Development workflow

1. Fork the repository and create a branch from `main`:

   ```bash
   git checkout -b feature/short-description
   ```

2. Make your changes. Keep commits small, with clear messages.
3. Test locally.
4. Push your branch and open a pull request. Describe what you changed and why, and link the related issue (for example, `Closes #12`).
5. A maintainer will review your pull request. Please be patient, and be ready to make changes.

### Ground rules

- **Privacy comes first.** Don't add features, dependencies, or logging that collect or store personal data, and don't add analytics or third-party tracking.
- **Keep it lightweight.** ICEPik needs to work on older phones and slow connections.
- **Keep it easy to understand and translate.** Use plain language, and don't hard-code text that can't be translated.
- **Match the style** of the surrounding code.
- **Be respectful.** Harassment or discrimination of any kind isn't tolerated.

### Reporting a security or privacy problem

Please **don't** open a public issue for a vulnerability or anything that could expose users. Email a maintainer directly instead (see [Contact](#contact)).

---

## License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.

---

## Contact

Questions, feedback, or want to get involved?

- **GitHub Issues:** [github.com/nthanvii/icepik/issues](https://github.com/nthanvii/icepik/issues) (best for bugs and feature requests)
- **Email the maintainers:**
  - Sebastian Jeremiah: <sjere0254@launchpadphilly.org>
  - Nathan Inggita: <ningg0252@launchpadphilly.org>
  - Juan Melvin: <jmelv0267@launchpadphilly.org>
  - Oswaldo Mendez Perez: <omend0268@launchpadphilly.org>
  - Killian Murphy: <kmurp0309@launchpadphilly.org>

---

## Acknowledgements

- Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors
- Official instance hosting by [Vercel](https://vercel.com)
- Authentication and database by [Supabase](https://supabase.com/)
- Inspired by the [Citizen](https://citizen.com/) app, but built only for ICE sightings
- Thanks to the community members who shared their experiences in our interviews, and to the [Launchpad Philly](https://www.launchpadphilly.org/) staff who supported this project

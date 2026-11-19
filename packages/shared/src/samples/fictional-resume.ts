import type { ResumeData } from '../resume.ts';

/**
 * A FICTIONAL person used by tests and (from Phase 4) sample mode.
 * The repo is public: never put a real person's details here (CLAUDE.md).
 * example.com / example.org are reserved for documentation, and the phone number is not real.
 */
export const FICTIONAL_RESUME: ResumeData = {
  contact: {
    name: 'Asha Testwala',
    email: 'asha.testwala@example.com',
    phone: '+91 90000 00000',
    location: 'Pune, India',
    links: [
      { id: 'link0', label: 'github.com/asha-example', url: 'https://github.com/asha-example' },
      { id: 'link1', label: 'asha.example.org', url: 'https://asha.example.org/' },
    ],
  },
  skills: [
    { id: 'skills0', category: 'Languages', items: ['TypeScript', 'JavaScript', 'SQL', 'C++'] },
    {
      id: 'skills1',
      category: 'Frameworks',
      items: ['React', 'Node.js', 'Express', 'Redux Toolkit', '.NET'],
    },
    { id: 'skills2', category: 'Tools', items: ['Docker', 'Git', 'PostgreSQL', 'GitHub Actions'] },
  ],
  experience: [
    {
      id: 'exp0',
      title: 'Software Engineer',
      company: 'Fictional Payments Pvt Ltd',
      location: 'Pune, India',
      startDate: 'Jul 2023',
      endDate: 'Present',
      bullets: [
        {
          id: 'exp0-b0',
          text: 'Built a React dashboard used by 40 internal support agents to track refund requests.',
        },
        {
          id: 'exp0-b1',
          text: 'Cut API p95 latency from 900 ms to 350 ms by adding PostgreSQL indexes and caching.',
        },
        {
          id: 'exp0-b2',
          text: 'Wrote integration tests with Jest & Supertest, raising coverage to 85% (from 60%).',
        },
      ],
    },
    {
      id: 'exp1',
      title: 'Software Engineering Intern',
      company: 'Example Logistics',
      location: 'Remote',
      startDate: 'Jan 2023',
      endDate: 'Jun 2023',
      bullets: [
        {
          id: 'exp1-b0',
          text: 'Migrated 12 legacy jQuery pages to React components with TypeScript.',
        },
        { id: 'exp1-b1', text: 'Automated nightly CSV exports with a Node.js job and cron.' },
      ],
    },
  ],
  projects: [
    {
      id: 'proj0',
      name: 'Budget Buddy',
      tech: ['React', 'Express', 'SQLite'],
      bullets: [
        {
          id: 'proj0-b0',
          text: 'Personal finance tracker with monthly charts and CSV import for 3 bank formats.',
        },
      ],
    },
  ],
  education: [
    {
      id: 'edu0',
      school: 'Example Institute of Technology',
      degree: 'B.Tech, Computer Engineering',
      location: 'Pune, India',
      startYear: '2019',
      endYear: '2023',
    },
  ],
};

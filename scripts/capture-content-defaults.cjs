// One-time mechanical capture of existing public copy before enabling the CMS.
const fs = require('node:fs'), path = require('node:path');
const { chromium } = require('../.tests/bounties/node_modules/playwright');
const root = path.resolve(__dirname, '..');
(async () => {
  const browser = await chromium.launch({ ...(process.platform === 'win32' ? { channel: 'msedge' } : {}), headless: true });
  try {
    const page = await browser.newPage();
    const read = async file => page.setContent(fs.readFileSync(path.join(root, file), 'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<link\b[^>]*>/gi, '').replace(/<img\b[^>]*>/gi, ''));
    await read('events.html');
    const events = await page.evaluate(() => [...document.querySelectorAll('#eventList .event-card')].map((card, i) => ({
      id: ['big-announcement', 'wsb-xcx-scrimmage', 'reload-custom-solo'][i],
      title: card.querySelector('h3').textContent.trim(), label: card.querySelector('.label').textContent.trim(),
      body: [card.querySelector('.event-history-date')?.textContent.trim(), ...[...card.querySelectorAll('.event-info > p:not(.label)')].map(p => p.textContent.trim())].filter(Boolean).join('\n\n'),
      status: 'published', order: i * 10, startsAt: card.dataset.eventDate ? card.dataset.eventDate + '-07:00' : null,
      endsAt: null, eventState: i === 0 ? 'upcoming' : 'ended', result: '', participants: '', mode: '', reward: '',
      link: card.getAttribute('href') || '', linkLabel: card.querySelector('.event-details-link')?.textContent.replace('→', '').trim() || '',
    })));
    await read('announcements.html');
    const announcements = await page.evaluate(() => [...document.querySelectorAll('.ann-countdown-block, #annFeed .ann-post')].map((card, i) => ({
      id: ['something-big', 'update-1-8', 'remembrance', 'new-site-updates'][i],
      title: card.querySelector('h3').textContent.trim(), label: card.querySelector('.label')?.textContent.trim() || 'TEAM NEWS',
      body: [...card.querySelectorAll(':scope > p:not(.label)')].map(p => p.textContent.trim()).join('\n\n'),
      status: 'published', order: i * 10, featured: i === 0,
      publishedAt: i < 2 ? '2026-09-27T12:00:00-07:00' : '2026-09-11T12:00:00-07:00',
      countdownAt: card.querySelector('[data-countdown-target]')?.dataset.countdownTarget ? card.querySelector('[data-countdown-target]').dataset.countdownTarget + '-07:00' : null,
      link: card.querySelector('.ann-events-link')?.getAttribute('href') || '', linkLabel: card.querySelector('.ann-events-link')?.textContent.replace('↗', '').trim() || '',
    })));
    if (events.length !== 3 || announcements.length !== 4) throw Error('Unexpected legacy content; review before capturing.');
    fs.writeFileSync(path.join(root, 'data/content-defaults.json'), JSON.stringify({ events, announcements }, null, 2) + '\n');
    console.log('Captured 3 events and 4 announcements; original copy preserved.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

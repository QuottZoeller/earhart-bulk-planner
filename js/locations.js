// Shared location config -- imported by both the Node scraper and the
// browser app so the two never drift out of sync on names/slugs.
//
// `name` must exactly match Purdue's HFS API location Name string (used
// verbatim, URL-encoded, in /menus/v2/locations/{name}/{date}).
//
// On-the-GO! locations (Earhart/Ford/Lawson/Windsor On-the-GO!) are
// deliberately excluded: verified against Purdue's own live site (not just
// the REST API) that they publish no itemized daily menu at all -- there is
// nothing for a scraper to fetch. Those are handled entirely as a
// manually-curated catalog in the app (see js/carryout.js).
export const LOCATIONS = [
  { slug: 'earhart', name: 'Earhart', displayName: 'Earhart', category: 'dining' },
  { slug: 'ford', name: 'Ford', displayName: 'Ford', category: 'dining' },
  { slug: 'hillenbrand', name: 'Hillenbrand', displayName: 'Hillenbrand', category: 'dining' },
  { slug: 'wiley', name: 'Wiley', displayName: 'Wiley', category: 'dining' },
  { slug: 'windsor', name: 'Windsor', displayName: 'Windsor', category: 'dining' },
  { slug: 'onebowl', name: '1bowl at Meredith Hall', displayName: '1bowl (Meredith)', category: 'quickbites' },
  { slug: 'petesza', name: "Pete's Za at Tarkington Hall", displayName: "Pete's Za (Tarkington)", category: 'quickbites' },
  { slug: 'sushiboss', name: 'Sushi Boss at South Hall', displayName: 'Sushi Boss (South)', category: 'quickbites' },
];

// On-the-GO! locations, for display purposes only (picking which one a
// manually-entered carry-out item is associated with). Never fetched.
export const ON_THE_GO_LOCATIONS = [
  { slug: 'earhart-otg', displayName: 'Earhart On-the-GO!' },
  { slug: 'ford-otg', displayName: 'Ford On-the-GO!' },
  { slug: 'lawson-otg', displayName: 'Lawson On-the-GO!' },
  { slug: 'windsor-otg', displayName: 'Windsor On-the-GO!' },
];

export function locationBySlug(slug) {
  return LOCATIONS.find((l) => l.slug === slug);
}

export function diningLocations() {
  return LOCATIONS.filter((l) => l.category === 'dining');
}

export function quickBitesLocations() {
  return LOCATIONS.filter((l) => l.category === 'quickbites');
}

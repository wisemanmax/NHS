// ============================================================
// REUNION CONFIG — Edit this file to update your event details
// ============================================================

const REUNION_CONFIG = {
  // Event Info
  schoolName: "Newark High School",
  reunionTitle: "Class of 2016 Reunion",
  year: "2016",          // Graduation year(s) being celebrated
  mascot: "Yellowjackets",
  tagline: "Ten years later — still buzzing.",
  description: `It's been a decade since we walked the halls of Newark High. Join the Class of 2016 for a night of catching up, swapping stories, and celebrating how far we've all come. Once a Yellowjacket, always a Yellowjacket.`,

  // Date & Venue (set to null if TBD)
  eventDate: "2026-08-15T18:00:00",   // ISO format — set to null if TBD
  eventDateDisplay: "August 15, 2026",
  eventTime: "6:00 PM – 11:00 PM",
  venueName: "TBA",
  venueAddress: "",
  venueMapLink: "",

  // Dress code, tickets, etc.
  dresscode: "Smart Casual",
  ticketInfo: "Free to attend — donations welcome at the door.",
  ageRestriction: "21+ event",

  // Organizer Contact
  organizerName: "Reunion Committee",
  organizerEmail: "reunion@newark2016.com",
  facebookGroup: "",

  // Social / sharing
  metaTitle: "Newark High School Class of 2016 — 10 Year Reunion",
  metaDescription: "Join us for the Newark High School Class of 2016 Ten Year Reunion. RSVP now — it's free!",
  metaImage: "", // Optional: full URL to a share image

  // Supabase (set in env, but fallback here for local dev)
  supabaseUrl: window.ENV_SUPABASE_URL || "YOUR_SUPABASE_URL",
  supabaseAnonKey: window.ENV_SUPABASE_ANON_KEY || "YOUR_SUPABASE_ANON_KEY",
};

// FAQ entries — edit freely
const FAQ_ITEMS = [
  {
    q: "Who is this reunion for?",
    a: "This event is for graduates of Newark High School's Class of 2016 — Yellowjackets! Alumni from nearby years are welcome too. Feel free to bring a guest."
  },
  {
    q: "How do I RSVP?",
    a: "Just fill out the RSVP form on this site. Takes about 60 seconds. You'll get a confirmation email once you're registered."
  },
  {
    q: "Is there a cost to attend?",
    a: "The event is free to attend. We'll have a donation jar at the door for venue costs, but nothing is required."
  },
  {
    q: "Can I bring a guest?",
    a: "Yes! Just indicate your guest count on the RSVP form so we can plan for capacity."
  },
  {
    q: "What should I wear?",
    a: "Smart casual — think nice jeans and a blazer, or a cocktail dress. No need to go overboard."
  },
  {
    q: "Will there be food and drinks?",
    a: "Yes — heavy appetizers and a full bar will be available throughout the evening."
  },
  {
    q: "I lost touch with classmates — how can I help spread the word?",
    a: "Share the link to this site in any group chats, social media groups, or LinkedIn connections from your class. Every RSVP helps us plan!"
  },
  {
    q: "I'm not sure if I can make it — should I still RSVP?",
    a: "Absolutely. You can select 'Maybe' on the form and update us closer to the date. It helps us with planning."
  },
  {
    q: "Will there be a photographer?",
    a: "Yes! We'll have a photographer for part of the evening. Photos will be shared after the event."
  },
  {
    q: "Who do I contact with questions?",
    a: `Reach out to the ${REUNION_CONFIG.organizerName} at ${REUNION_CONFIG.organizerEmail}.`
  },
];

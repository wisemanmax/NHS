// ============================================================
// REUNION CONFIG — Edit this file to update your event details
// ============================================================

const REUNION_CONFIG = {
  // Event Info
  schoolName: "Lincoln High School",
  reunionTitle: "Class Reunion",
  year: "2005",          // Graduation year(s) being celebrated
  tagline: "Twenty years, one night, and the people who shaped us.",
  description: `We're bringing back the class of 2005 for a night of good stories, old faces, and long overdue catch-ups. Come see where life has taken everyone.`,

  // Date & Venue (set to null if TBD)
  eventDate: "2025-09-20T18:00:00",   // ISO format — set to null if TBD
  eventDateDisplay: "September 20, 2025",
  eventTime: "6:00 PM – 11:00 PM",
  venueName: "The Grand Ballroom at Riverside",
  venueAddress: "123 Riverside Drive, Springfield, IL 62701",
  venueMapLink: "https://maps.google.com/?q=123+Riverside+Drive+Springfield+IL",

  // Dress code, tickets, etc.
  dresscode: "Business Casual",
  ticketInfo: "Free to attend — donations welcome at the door.",
  ageRestriction: "21+ event",

  // Organizer Contact
  organizerName: "Sarah Mitchell",
  organizerEmail: "hello@lincolnreunion2025.com",
  facebookGroup: "https://facebook.com/groups/lincoln2005reunion",

  // Social / sharing
  metaTitle: "Lincoln High Class of 2005 Reunion",
  metaDescription: "Join us September 20, 2025 for the Lincoln High School Class of 2005 Reunion. RSVP now!",
  metaImage: "", // Optional: full URL to a share image

  // Supabase (set in env, but fallback here for local dev)
  supabaseUrl: window.ENV_SUPABASE_URL || "YOUR_SUPABASE_URL",
  supabaseAnonKey: window.ENV_SUPABASE_ANON_KEY || "YOUR_SUPABASE_ANON_KEY",
};

// FAQ entries — edit freely
const FAQ_ITEMS = [
  {
    q: "Who is this reunion for?",
    a: "This event is primarily for graduates of Lincoln High School's Class of 2005, though alumni from nearby years are welcome to join. Bring a guest if you'd like!"
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
    a: "Business casual — think nice jeans and a blazer, or a cocktail dress. No tuxedos required."
  },
  {
    q: "Will there be food and drinks?",
    a: "Yes — heavy appetizers and a full bar will be available throughout the evening."
  },
  {
    q: "I lost touch with classmates — how can I help spread the word?",
    a: "Share the link to this site in any group chats, Facebook groups, or LinkedIn connections from your class. Every RSVP helps us plan!"
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
    a: `Reach out to ${REUNION_CONFIG.organizerName} at ${REUNION_CONFIG.organizerEmail} or message us through the Facebook group.`
  },
];

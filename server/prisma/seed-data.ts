export const categories = [
  { id: 1, name: "Account and Access", isActive: true },
  { id: 2, name: "Hardware", isActive: true },
  { id: 3, name: "Software", isActive: true },
  { id: 4, name: "Network", isActive: true },
] as const;

export const relatedSystems = [
  { name: "Email", description: "University email and mailbox services", isActive: true },
  { name: "Campus Wi-Fi", description: "Wireless network access across campus", isActive: true },
  { name: "VPN", description: "Remote access to university network resources", isActive: true },
  { name: "LEB2 App", description: "Learning Environment and course submission system", isActive: true },
  { name: "Grade Submission App", description: "Application used to record and submit grades", isActive: true },
  { name: "Printer", description: "Shared printers and print services", isActive: true },
  { name: "Corporate Laptop", description: "University-managed laptop hardware and software", isActive: true },
] as const;

export const requesterUsers = [
  { name: "Amina Rahman", email: "amina.rahman@toktickit.local", department: "Academic Affairs", isActive: true },
  { name: "Ben Carter", email: "ben.carter@toktickit.local", department: "Finance", isActive: true },
  { name: "Chalida Srisuk", email: "chalida.srisuk@toktickit.local", department: "Engineering", isActive: true },
  { name: "Diego Santos", email: "diego.santos@toktickit.local", department: "Student Services", isActive: true },
  { name: "Inactive Requester", email: "inactive.requester@toktickit.local", department: "Former Staff", isActive: false },
] as const;

export const staffUsers = [
  { name: "Ethan Brooks", email: "ethan.brooks@toktickit.local", department: "IT Operations", isActive: true },
  { name: "Farah Malik", email: "farah.malik@toktickit.local", department: "IT Operations", isActive: true },
  { name: "Gavin Lee", email: "gavin.lee@toktickit.local", department: "IT Operations", isActive: true },
  { name: "Inactive IT Staff", email: "inactive.staff@toktickit.local", department: "IT Operations", isActive: false },
] as const;

export const administratorUsers = [
  { name: "Harper Morgan", email: "harper.morgan@toktickit.local", department: "IT Governance", isActive: true },
] as const;

export const ticketFixtures = [
  {
    requesterEmail: "amina.rahman@toktickit.local",
    idempotencyKey: "11111111-1111-4111-8111-111111111111",
    categoryName: "Account and Access",
    relatedSystemName: "Email",
    summary: "Cannot access university email",
    description: "The requester cannot sign in to the university mailbox.",
    requestedPriority: "HIGH",
    itPriority: "HIGH",
    currentStatus: "OPEN",
    ownerEmail: "ethan.brooks@toktickit.local",
  },
  {
    requesterEmail: "ben.carter@toktickit.local",
    idempotencyKey: "22222222-2222-4222-8222-222222222222",
    categoryName: "Hardware",
    relatedSystemName: "Corporate Laptop",
    summary: "Laptop will not start",
    description: "The assigned laptop shows no power indicator.",
    requestedPriority: "CRITICAL",
    itPriority: "CRITICAL",
    currentStatus: "IN_PROGRESS",
    ownerEmail: "farah.malik@toktickit.local",
  },
  {
    requesterEmail: "chalida.srisuk@toktickit.local",
    idempotencyKey: "33333333-3333-4333-8333-333333333333",
    categoryName: "Network",
    relatedSystemName: "Campus Wi-Fi",
    summary: "Intermittent Wi-Fi connection",
    description: "The connection drops repeatedly during lectures.",
    requestedPriority: "MEDIUM",
    itPriority: "LOW",
    currentStatus: "RESOLVED",
  },
  {
    requesterEmail: "diego.santos@toktickit.local",
    idempotencyKey: "44444444-4444-4444-8444-444444444444",
    categoryName: "Software",
    relatedSystemName: "LEB2 App",
    summary: "Grade submission error",
    description: "Submitting a grade returns an unexpected error.",
    requestedPriority: "LOW",
    itPriority: "MEDIUM",
    currentStatus: "WAITING_FOR_REQUESTER",
  },
] as const;

export const publicCommentFixtures = [
  {
    ticketKey: "11111111-1111-4111-8111-111111111111",
    authorEmail: "ethan.brooks@toktickit.local",
    content: "We are checking the mailbox service and will update you shortly.",
  },
  {
    ticketKey: "33333333-3333-4333-8333-333333333333",
    authorEmail: "chalida.srisuk@toktickit.local",
    content: "The connection is stable again. Please let us know if it drops.",
  },
] as const;

export const internalNoteFixtures = [
  {
    ticketKey: "22222222-2222-4222-8222-222222222222",
    authorEmail: "farah.malik@toktickit.local",
    content: "Power adapter diagnostics passed; preparing a replacement unit.",
  },
  {
    ticketKey: "44444444-4444-4444-8444-444444444444",
    authorEmail: "harper.morgan@toktickit.local",
    content: "Vendor status page shows a matching incident under investigation.",
  },
] as const;

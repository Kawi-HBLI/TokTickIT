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

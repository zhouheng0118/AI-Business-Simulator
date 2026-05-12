export type UserRole = "student" | "professor";

export interface User {
  id: string;
  fullName: string;
  email: string;
  password: string;
  role: UserRole;
}

const DEMO_USERS: User[] = [
  {
    id: "demo-prof",
    fullName: "Dr. Sarah Chen",
    email: "professor@demo.com",
    password: "demo1234",
    role: "professor",
  },
  {
    id: "demo-student",
    fullName: "Alex Johnson",
    email: "student@demo.com",
    password: "demo1234",
    role: "student",
  },
];

function getStoredUsers(): User[] {
  if (typeof window === "undefined") return DEMO_USERS;
  try {
    const raw = localStorage.getItem("abs_users");
    const custom: User[] = raw ? JSON.parse(raw) : [];
    return [...DEMO_USERS, ...custom];
  } catch {
    return DEMO_USERS;
  }
}

export function registerUser(data: Omit<User, "id">): void {
  try {
    const raw = localStorage.getItem("abs_users");
    const stored: User[] = raw ? JSON.parse(raw) : [];
    const user: User = { ...data, id: crypto.randomUUID() };
    localStorage.setItem("abs_users", JSON.stringify([...stored, user]));
    setCurrentUser(user);
  } catch {
  }
}

export function loginUser(email: string, password: string): User | null {
  const users = getStoredUsers();
  const user = users.find((u) => u.email === email && u.password === password) ?? null;
  if (user) setCurrentUser(user);
  return user;
}

export function getCurrentUser(): User | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("abs_current_user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setCurrentUser(user: User): void {
  localStorage.setItem("abs_current_user", JSON.stringify(user));
}

export function logout(): void {
  localStorage.removeItem("abs_current_user");
}

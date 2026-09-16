export interface UserDatabaseRow {
  id: string;
  email: string;
  password: string;
  created_at: Date;
}

export interface PublicUser {
  id: string;
  email: string;
  createdAt: Date;
}

export interface Credentials {
  email: string;
  password: string;
}

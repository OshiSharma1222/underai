import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/schema";

export const userRepo = {
  async findByEmail(email: string) {
    return db.query.users.findFirst({ where: eq(users.email, email) });
  },

  async findById(id: string) {
    return db.query.users.findFirst({ where: eq(users.id, id) });
  },
};

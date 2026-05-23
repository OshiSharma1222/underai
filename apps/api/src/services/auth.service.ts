import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { config } from "../lib/config";
import { UnauthorizedError } from "../lib/errors";
import { userRepo } from "../repos/user.repo";

export const authService = {
  async login(email: string, password: string) {
    const user = await userRepo.findByEmail(email);
    if (!user) {
      throw new UnauthorizedError("Invalid email or password");
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedError("Invalid email or password");
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn } as jwt.SignOptions
    );

    return {
      token,
      user: { id: user.id, email: user.email },
    };
  },
};

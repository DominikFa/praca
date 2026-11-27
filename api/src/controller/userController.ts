import { NextFunction, Request, Response, Router } from 'express';
import { AuthMiddleware } from '../middleware/authMiddleware';
import { UserService } from '../service/userService';

export class UserController {
  public readonly router: Router;

  constructor(
    private readonly userService: UserService,
    private readonly authMiddleware: AuthMiddleware
  ) {
    this.router = Router();
    this.registerRoutes();
  }

  private registerRoutes(): void {
    this.router.post('/users/register', this.register);
    this.router.post('/users/login', this.login);
    this.router.get('/users/me', this.authMiddleware.authenticate, this.getMe);
    this.router.patch('/users/me', this.authMiddleware.authenticate, this.updateMe);
    this.router.get('/users/search', this.authMiddleware.authenticate, this.searchUsers);
  }

  private register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name, login, password } = req.body;
      const result = await this.userService.register(name, login, password);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  };

  private login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { login, password } = req.body;
      const result = await this.userService.login(login, password);
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  private getMe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const profile = await this.userService.getProfile(req.user!.userId);
      res.json(profile);
    } catch (err) {
      next(err);
    }
  };

  private updateMe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name, password } = req.body;
      const updated = await this.userService.updateProfile(req.user!.userId, { name, password });
      res.json(updated);
    } catch (err) {
      next(err);
    }
  };

  private searchUsers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = typeof req.query.name === 'string' ? req.query.name : '';
      const users = await this.userService.searchByName(query, req.user!.userId);
      res.json(users);
    } catch (err) {
      next(err);
    }
  };
}
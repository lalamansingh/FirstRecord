export class AppError extends Error {
  constructor(
    message: string,
    public readonly status: number = 400,
    public readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string, fieldErrors?: Record<string, string>) {
    super(message, 422, fieldErrors);
    this.name = "ValidationError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action.") {
    super(message, 403);
    this.name = "ForbiddenError";
  }
}

/** Also used for records that exist but are not visible, to avoid disclosing existence. */
export class NotFoundError extends AppError {
  constructor(message = "Record not found or you do not have access to it.") {
    super(message, 404);
    this.name = "NotFoundError";
  }
}

export class UnauthenticatedError extends AppError {
  constructor() {
    super("Please sign in to continue.", 401);
    this.name = "UnauthenticatedError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409);
    this.name = "ConflictError";
  }
}

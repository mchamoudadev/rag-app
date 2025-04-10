import { jwtVerify } from 'jose';

interface UserData {
  userId: string;
  email: string;
}

export async function verifyToken(token: string): Promise<UserData | null> {
  try {
    // Get the JWT secret from environment variables
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.error('JWT_SECRET is not defined in environment variables');
      return null;
    }

    // Convert the secret to Uint8Array as required by jose
    const secretKey = new TextEncoder().encode(secret);
    
    // Verify the token
    const { payload } = await jwtVerify(token, secretKey);
    return payload as unknown as UserData;
  } catch (error) {
    console.error('Error verifying token:', error);
    return null;
  }
} 
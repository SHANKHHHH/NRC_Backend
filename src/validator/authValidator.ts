import { isValidPhoneNumber } from "libphonenumber-js";
import { z } from 'zod'

export const loginSchema = z.object({
    email:z.string().email('Valid email is required'),
    password:z.string().min(6, 'password must be atleast 6 character'),
    replaceSession: z.boolean().optional(), // When true, allow login by replacing existing session (e.g. same device re-open)
})

export type loginRequest = z.infer<typeof loginSchema>;
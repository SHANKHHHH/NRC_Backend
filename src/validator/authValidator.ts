import { isValidPhoneNumber } from "libphonenumber-js";
import { z } from 'zod'

export const loginSchema = z.object({
    id:z.string().min(2,'Id must be present'),
    password:z.string().min(6, 'password must be atleast 6 character')
})

export type loginRequest = z.infer<typeof loginSchema>;
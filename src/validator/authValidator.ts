import { isValidPhoneNumber } from "libphonenumber-js";
import { z } from 'zod'


export const loginSchema = z.object({
    id:z.string().min(2,'Id must be present'),
    password:z.string().min(6, 'password must be atleast 6 character'),
    PhoneNumber:z.string().refine((val) => isValidPhoneNumber("+91"+ val) || isValidPhoneNumber(val),{
        message: "Invalid phone number"
    })
})






export type loginRequest = z.infer<typeof loginSchema>;
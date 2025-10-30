import { LoginForm } from "@/components/auth/login-form"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import Image from "next/image"
import QvLogo from "@/logo/qv-beneficios.png"

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center"></div>

          <Card>
            <CardHeader>
            <h1 className="h-5 font-bold text-balance text-center">Potal BonusCore</h1>
            <div className="w-full flex justify-center mb-2">
              <Image src={QvLogo} alt="QV Benefícios" className="h-15 w-auto mt-3" />
            </div>
            <CardTitle className="text-center">ACESSO AO BCR</CardTitle>
            <CardDescription className="text-center">Cálculo, Auditoria e Governança de Bonificações</CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

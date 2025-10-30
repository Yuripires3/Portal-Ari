"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { Pencil, Check, X, Plus, Trash2 } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface UserRow {
  id?: string
  cpf: string
  nome: string
  email: string
  area: string | null
  usuario_login: string
  classificacao?: string
  senha?: string
  data_cadastro?: string
  data_alteracao?: string
}

export default function CadastroUsuariosPage() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | "new" | null>(null)
  const { toast } = useToast()

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/users")
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erro ao carregar usuários")
      setUsers(data.users as UserRow[])
    } catch (e) {
      toast({ title: "Erro", description: e instanceof Error ? e.message : "Falha ao carregar usuários", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const saveRow = async (u: UserRow) => {
    try {
      const idStr = (u as any).id ? String((u as any).id).trim() : ""
      const isNew = !idStr || editingId === "new"
      if (!isNew && !/^\d+$/.test(idStr)) {
        toast({ title: "ID inválido", description: "Não foi possível identificar o usuário para atualização.", variant: "destructive" })
        return
      }
      const url = isNew ? "/api/admin/users" : `/api/admin/users/${encodeURIComponent(idStr)}`
      const method = isNew ? "POST" : "PUT"
      const payload: any = { ...u }
      if (isNew) delete (payload as any).id
      // Se a senha estiver vazia em edição, não enviar para não zerar
      if (!isNew && (!payload.senha || payload.senha.trim() === "")) {
        delete payload.senha
      }
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Erro ao salvar usuário")
      toast({ title: "Salvo", description: isNew ? `Usuário ${data.user?.usuario_login || u.usuario_login} criado` : `Usuário ${u.usuario_login} atualizado` })
      setEditingId(null)
      load()
    } catch (e) {
      toast({ title: "Erro", description: e instanceof Error ? e.message : "Falha ao salvar usuário", variant: "destructive" })
    }
  }

  const addNewRow = () => {
    if (editingId === "new") return
    const blank: UserRow = { id: "", cpf: "", usuario_login: "", nome: "", email: "", area: "", classificacao: "USUARIO" }
    setUsers((prev) => [blank, ...prev])
    setEditingId("new")
  }

  const cancelEdit = (index: number) => {
    if (editingId === "new") {
      setUsers((prev) => prev.slice(1))
    }
    setEditingId(null)
    load()
  }

  const deleteRow = async (u: UserRow, index: number) => {
    const idStr = (u as any).id ? String((u as any).id).trim() : ""
    if (!/^\d+$/.test(idStr)) {
      // Para linha nova, apenas remover da UI
      if (editingId === "new" && index === 0) {
        setUsers((prev) => prev.slice(1))
        setEditingId(null)
      }
      return
    }
    const ok = confirm(`Deseja realmente excluir o usuário "${u.usuario_login}"?`)
    if (!ok) return
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(idStr)}`, { method: "DELETE" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Erro ao excluir usuário")
      toast({ title: "Excluído", description: `Usuário ${u.usuario_login} removido` })
      setEditingId(null)
      load()
    } catch (e) {
      toast({ title: "Erro", description: e instanceof Error ? e.message : "Falha ao excluir usuário", variant: "destructive" })
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Cadastro de usuários</h1>
        <p className="text-muted-foreground mt-1">Gerencie os usuários do sistema</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Usuários</CardTitle>
          <CardDescription>Gerencie usuários. Clique em Editar para alterar ou em Cadastrar novo para criar.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <Button onClick={addNewRow} size="sm">
              <Plus className="h-4 w-4 mr-2" /> Cadastrar novo usuário
            </Button>
          </div>
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>CPF</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Área</TableHead>
                  <TableHead>Classificação</TableHead>
                  <TableHead>Nova senha</TableHead>
                  <TableHead className="w-[140px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u, idx) => {
                  const isEditing = editingId === (u.id ?? "") || (editingId === "new" && idx === 0)
                  return (
                  <TableRow key={`${u.id}-${idx}`}>
                    <TableCell className="min-w-40">
                      <Input value={u.cpf || ""} disabled={!isEditing} onChange={(e) => {
                        const v = e.target.value; setUsers((arr) => arr.map((x, i) => i === idx ? { ...x, cpf: v } : x))
                      }} />
                    </TableCell>
                    <TableCell className="min-w-40">
                      <Input value={u.usuario_login || ""} disabled={!isEditing} onChange={(e) => setUsers((arr) => arr.map((x, i) => i === idx ? { ...x, usuario_login: e.target.value } : x))} />
                    </TableCell>
                    <TableCell className="min-w-56">
                      <Input value={u.nome || ""} disabled={!isEditing} onChange={(e) => setUsers((arr) => arr.map((x, i) => i === idx ? { ...x, nome: e.target.value } : x))} />
                    </TableCell>
                    <TableCell className="min-w-56">
                      <Input type="email" value={u.email || ""} disabled={!isEditing} onChange={(e) => setUsers((arr) => arr.map((x, i) => i === idx ? { ...x, email: e.target.value } : x))} />
                    </TableCell>
                    <TableCell className="min-w-40">
                      <Select value={u.area || ""} onValueChange={(val) => setUsers((arr) => arr.map((x, i) => i === idx ? { ...x, area: val } : x))} disabled={!isEditing}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione a área" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Operacoes">Operacoes</SelectItem>
                          <SelectItem value="Financeiro">Financeiro</SelectItem>
                          <SelectItem value="Faturamento">Faturamento</SelectItem>
                          <SelectItem value="TI">TI</SelectItem>
                          <SelectItem value="Movimentacao">Movimentacao</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="min-w-40">
                      <Select value={(u.classificacao || "USUARIO").toString().toUpperCase()} onValueChange={(val) => setUsers((arr) => arr.map((x, i) => i === idx ? { ...x, classificacao: val } : x))} disabled={!isEditing}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ADMIN">ADMIN</SelectItem>
                          <SelectItem value="USUARIO">USUARIO</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="min-w-48">
                      <Input type="password" placeholder={isEditing ? "Preencha para alterar" : ""} disabled={!isEditing} value={u.senha || ""} onChange={(e) => setUsers((arr) => arr.map((x, i) => i === idx ? { ...x, senha: e.target.value } : x))} />
                    </TableCell>
                    <TableCell className="space-x-2">
                      {isEditing ? (
                        <>
                          <Button variant="default" size="sm" onClick={() => saveRow(u)}>
                            <Check className="h-4 w-4 mr-1" /> Salvar
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => cancelEdit(idx)}>
                            <X className="h-4 w-4 mr-1" /> Cancelar
                          </Button>
                          {!(editingId === "new" && idx === 0) && (
                            <Button variant="destructive" size="icon" onClick={() => deleteRow(u, idx)} title="Excluir">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </>
                      ) : (
                        <>
                          <Button variant="outline" size="sm" onClick={() => setEditingId(String(u.id ?? ""))} disabled={editingId === "new"} title={editingId === "new" ? "Conclua o cadastro em andamento" : "Editar"}>
                            <Pencil className="h-4 w-4 mr-1" /> Editar
                          </Button>
                          {!(editingId === "new" && idx === 0) && (
                            <Button variant="destructive" size="icon" onClick={() => deleteRow(u, idx)} title="Excluir">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                  )})}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}



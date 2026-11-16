import { describe, expect, it } from "vitest";
import type { Invitation } from "@casamento/shared";
import {
  attendingCount,
  hasAnswered,
  initialValues,
  plusOneAvailable,
  toRsvpRequest,
  validateAnswer,
  validateEmail,
  validatePhone,
  validatePlusOneName,
} from "./rsvp";

const guest = (id: number, name: string, over: Partial<Invitation["guests"][number]> = {}) => ({
  id,
  name,
  isChild: false,
  ageRange: null,
  isPlusOne: false,
  rsvpStatus: "pending" as const,
  dietaryNotes: null,
  ...over,
});

const invitation = (over: Partial<Invitation> = {}): Invitation => ({
  label: "Família Teste",
  side: "dani",
  maxGuests: 3,
  allowPlusOne: true,
  guests: [guest(1, "Ana Teste"), guest(2, "Beto Teste")],
  contact: { email: null, phone: null },
  deadline: "2027-03-10T23:59:59-03:00",
  isClosed: false,
  ...over,
});

describe("initialValues", () => {
  it("pré-preenche respostas, restrições, acompanhante e contato", () => {
    const inv = invitation({
      guests: [
        guest(1, "Ana Teste", { rsvpStatus: "confirmed", dietaryNotes: "Sem glúten" }),
        guest(2, "Beto Teste", { rsvpStatus: "declined" }),
        guest(3, "Cris Dias", { isPlusOne: true, rsvpStatus: "confirmed" }),
      ],
      contact: { email: "ana@exemplo.com", phone: "11 90000-0000" },
    });
    expect(initialValues(inv)).toEqual({
      guests: [
        { id: 1, attending: "yes", dietaryNotes: "Sem glúten" },
        { id: 2, attending: "no", dietaryNotes: "" },
      ],
      plusOneName: "Cris Dias",
      email: "ana@exemplo.com",
      phone: "11 90000-0000",
      website: "",
    });
  });

  it("convidado pendente começa sem resposta", () => {
    const values = initialValues(invitation());
    expect(values.guests.map((g) => g.attending)).toEqual(["", ""]);
    expect(hasAnswered(invitation())).toBe(false);
    expect(hasAnswered(invitation({ guests: [guest(1, "Ana", { rsvpStatus: "declined" })] }))).toBe(
      true,
    );
  });
});

describe("plusOneAvailable", () => {
  it("exige permissão, alguém presente e lugar no convite", () => {
    expect(plusOneAvailable(invitation(), 1)).toBe(true);
    expect(plusOneAvailable(invitation(), 0)).toBe(false);
    expect(plusOneAvailable(invitation({ allowPlusOne: false }), 1)).toBe(false);
    expect(plusOneAvailable(invitation({ maxGuests: 2 }), 2)).toBe(false);
  });
});

describe("toRsvpRequest", () => {
  it("manda o estado final: restrição só de quem vai, contato vazio vira null", () => {
    const req = toRsvpRequest(
      {
        guests: [
          { id: 1, attending: "yes", dietaryNotes: "  Vegetariana " },
          { id: 2, attending: "no", dietaryNotes: "esquecida" },
        ],
        plusOneName: "  ",
        email: " ana@exemplo.com ",
        phone: "",
        website: "",
      },
      invitation(),
    );
    expect(req).toEqual({
      guests: [
        { id: 1, attending: true, dietaryNotes: "Vegetariana" },
        { id: 2, attending: false, dietaryNotes: null },
      ],
      plusOneName: null,
      contact: { email: "ana@exemplo.com", phone: null },
      website: "",
    });
  });

  it("descarta o acompanhante quando ninguém vai", () => {
    const req = toRsvpRequest(
      {
        guests: [
          { id: 1, attending: "no", dietaryNotes: "" },
          { id: 2, attending: "no", dietaryNotes: "" },
        ],
        plusOneName: "Cris Dias",
        email: "",
        phone: "",
        website: "",
      },
      invitation(),
    );
    expect(req.plusOneName).toBeNull();
    expect(attendingCount([{ attending: "no" }, { attending: "yes" }])).toBe(1);
  });

  it("mantém o acompanhante quando há lugar", () => {
    const req = toRsvpRequest(
      {
        guests: [
          { id: 1, attending: "yes", dietaryNotes: "" },
          { id: 2, attending: "no", dietaryNotes: "" },
        ],
        plusOneName: "Cris Dias",
        email: "",
        phone: "",
        website: "",
      },
      invitation(),
    );
    expect(req.plusOneName).toBe("Cris Dias");
  });
});

describe("validações com os schemas do contrato", () => {
  it("e-mail e telefone", () => {
    expect(validateEmail("")).toBe(true);
    expect(validateEmail("ana@exemplo.com")).toBe(true);
    expect(validateEmail("ana@")).toMatch(/E-mail inválido/);
    expect(validatePhone("(11) 90000-0000")).toBe(true);
    expect(validatePhone("abc")).toMatch(/Telefone inválido/);
  });

  it("nome do acompanhante", () => {
    expect(validatePlusOneName("")).toBe(true);
    expect(validatePlusOneName("A")).toMatch(/nome e sobrenome/);
    expect(validatePlusOneName("Cris Dias")).toBe(true);
  });

  it("resposta obrigatória", () => {
    expect(validateAnswer("", "Ana")).toMatch(/Diga se Ana vai ou não/);
    expect(validateAnswer("no", "Ana")).toBe(true);
  });
});

/**
 * Base da temporada 2026.
 *
 * Identidade (nomes, números, equipes, cores e países) derivada dos manifests
 * públicos reunidos em FM26-Assets. Atributos de pilotos, desempenho dos carros,
 * orçamentos, salários e patrocinadores são ESTIMATIVAS DE BALANCEAMENTO do jogo,
 * não dados oficiais de desempenho.
 */

export interface DriverAttributes {
  velocidade: number;
  consistencia: number;
  gestaoPneus: number;
  ultrapassagem: number;
  defesa: number;
  chuva: number;
  experiencia: number;
  agressividade: number;
}

export interface DriverData {
  id: string;
  nome: string;
  primeiroNome: string;
  sobrenome: string;
  codigo: string;
  numero: number;
  nacionalidade: string;
  equipeId: string;
  atributos: DriverAttributes;
  salario: number; // milhões por etapa
  contratoEtapas: number;
  estimado: true;
}

export interface CarAttributes {
  aerodinamica: number;
  curvas: number;
  retas: number;
  energia: number;
  confiabilidade: number;
  gestaoPneus: number;
}

export interface TeamData {
  id: string;
  nome: string;
  nomeOficial: string;
  sigla: string;
  pais: string;
  corPrimaria: string;
  corSecundaria: string;
  carro: CarAttributes;
  orcamentoInicial: number; // milhões
  expectativa: string;
  objetivo: string;
  reputacao: number; // 0-100, usada em patrocínio
  pilotos: [string, string];
  estimado: true;
}

export const TEAMS_2026: TeamData[] = [
  {
    id: "team_mclaren",
    nome: "McLaren",
    nomeOficial: "McLaren Mastercard F1 Team",
    sigla: "MCL",
    pais: "Reino Unido",
    corPrimaria: "#FF8000",
    corSecundaria: "#804000",
    carro: { aerodinamica: 95, curvas: 94, retas: 90, energia: 92, confiabilidade: 91, gestaoPneus: 90 },
    orcamentoInicial: 118,
    expectativa: "Título de construtores",
    objetivo: "Terminar entre os 2 primeiros no campeonato",
    reputacao: 98,
    pilotos: ["driver_lando_norris", "driver_oscar_piastri"],
    estimado: true,
  },
  {
    id: "team_mercedes",
    nome: "Mercedes",
    nomeOficial: "Mercedes-AMG Petronas Formula One Team",
    sigla: "MER",
    pais: "Alemanha",
    corPrimaria: "#27F4D2",
    corSecundaria: "#067E6A",
    carro: { aerodinamica: 91, curvas: 90, retas: 95, energia: 96, confiabilidade: 88, gestaoPneus: 86 },
    orcamentoInicial: 112,
    expectativa: "Lutar pelo título",
    objetivo: "Terminar entre os 3 primeiros no campeonato",
    reputacao: 95,
    pilotos: ["driver_george_russell", "driver_kimi_antonelli"],
    estimado: true,
  },
  {
    id: "team_red_bull",
    nome: "Red Bull Racing",
    nomeOficial: "Oracle Red Bull Racing",
    sigla: "RBR",
    pais: "Áustria",
    corPrimaria: "#3671C6",
    corSecundaria: "#142948",
    carro: { aerodinamica: 92, curvas: 91, retas: 89, energia: 88, confiabilidade: 85, gestaoPneus: 88 },
    orcamentoInicial: 108,
    expectativa: "Pódios consistentes",
    objetivo: "Vencer ao menos uma corrida e ficar no top 3",
    reputacao: 94,
    pilotos: ["driver_max_verstappen", "driver_isack_hadjar"],
    estimado: true,
  },
  {
    id: "team_ferrari",
    nome: "Ferrari",
    nomeOficial: "Scuderia Ferrari HP",
    sigla: "FER",
    pais: "Itália",
    corPrimaria: "#E8002D",
    corSecundaria: "#5C0012",
    carro: { aerodinamica: 90, curvas: 92, retas: 94, energia: 91, confiabilidade: 84, gestaoPneus: 87 },
    orcamentoInicial: 116,
    expectativa: "Lutar pelo título",
    objetivo: "Terminar entre os 3 primeiros no campeonato",
    reputacao: 96,
    pilotos: ["driver_charles_leclerc", "driver_lewis_hamilton"],
    estimado: true,
  },
  {
    id: "team_williams",
    nome: "Williams",
    nomeOficial: "Atlassian Williams Racing",
    sigla: "WIL",
    pais: "Reino Unido",
    corPrimaria: "#1868DB",
    corSecundaria: "#082145",
    carro: { aerodinamica: 84, curvas: 83, retas: 88, energia: 85, confiabilidade: 82, gestaoPneus: 80 },
    orcamentoInicial: 66,
    expectativa: "Pontuar com frequência",
    objetivo: "Terminar entre os 6 primeiros no campeonato",
    reputacao: 72,
    pilotos: ["driver_alexander_albon", "driver_carlos_sainz"],
    estimado: true,
  },
  {
    id: "team_aston_martin",
    nome: "Aston Martin",
    nomeOficial: "Aston Martin Aramco Formula One Team",
    sigla: "AMR",
    pais: "Reino Unido",
    corPrimaria: "#229971",
    corSecundaria: "#0F4331",
    carro: { aerodinamica: 83, curvas: 84, retas: 81, energia: 80, confiabilidade: 78, gestaoPneus: 82 },
    orcamentoInicial: 88,
    expectativa: "Brigar pelo top 5",
    objetivo: "Terminar entre os 5 primeiros no campeonato",
    reputacao: 78,
    pilotos: ["driver_fernando_alonso", "driver_lance_stroll"],
    estimado: true,
  },
  {
    id: "team_racing_bulls",
    nome: "Racing Bulls",
    nomeOficial: "Visa Cash App Racing Bulls F1 Team",
    sigla: "VCARB",
    pais: "Itália",
    corPrimaria: "#6692FF",
    corSecundaria: "#0038C2",
    carro: { aerodinamica: 80, curvas: 81, retas: 82, energia: 83, confiabilidade: 80, gestaoPneus: 79 },
    orcamentoInicial: 55,
    expectativa: "Brigar por pontos",
    objetivo: "Terminar entre os 7 primeiros no campeonato",
    reputacao: 64,
    pilotos: ["driver_liam_lawson", "driver_arvid_lindblad"],
    estimado: true,
  },
  {
    id: "team_haas",
    nome: "Haas",
    nomeOficial: "TGR Haas F1 Team",
    sigla: "HAA",
    pais: "Estados Unidos",
    corPrimaria: "#DEE1E2",
    corSecundaria: "#667175",
    carro: { aerodinamica: 79, curvas: 78, retas: 80, energia: 79, confiabilidade: 81, gestaoPneus: 78 },
    orcamentoInicial: 50,
    expectativa: "Brigar por pontos",
    objetivo: "Terminar entre os 8 primeiros no campeonato",
    reputacao: 58,
    pilotos: ["driver_esteban_ocon", "driver_oliver_bearman"],
    estimado: true,
  },
  {
    id: "team_audi",
    nome: "Audi",
    nomeOficial: "Audi F1 Team",
    sigla: "AUD",
    pais: "Alemanha",
    corPrimaria: "#FF2D00",
    corSecundaria: "#751500",
    carro: { aerodinamica: 78, curvas: 79, retas: 81, energia: 84, confiabilidade: 76, gestaoPneus: 77 },
    orcamentoInicial: 84,
    expectativa: "Evoluir ao longo do ano",
    objetivo: "Terminar entre os 8 primeiros no campeonato",
    reputacao: 70,
    pilotos: ["driver_nico_hulkenberg", "driver_gabriel_bortoleto"],
    estimado: true,
  },
  {
    id: "team_alpine",
    nome: "Alpine",
    nomeOficial: "BWT Alpine Formula One Team",
    sigla: "ALP",
    pais: "França",
    corPrimaria: "#00A1E8",
    corSecundaria: "#004E70",
    carro: { aerodinamica: 76, curvas: 75, retas: 78, energia: 77, confiabilidade: 74, gestaoPneus: 75 },
    orcamentoInicial: 56,
    expectativa: "Evoluir e pontuar",
    objetivo: "Terminar entre os 9 primeiros no campeonato",
    reputacao: 60,
    pilotos: ["driver_pierre_gasly", "driver_franco_colapinto"],
    estimado: true,
  },
  {
    id: "team_cadillac",
    nome: "Cadillac",
    nomeOficial: "Cadillac Formula 1 Team",
    sigla: "CAD",
    pais: "Estados Unidos",
    corPrimaria: "#AAAAAD",
    corSecundaria: "#58585B",
    carro: { aerodinamica: 72, curvas: 71, retas: 75, energia: 76, confiabilidade: 70, gestaoPneus: 72 },
    orcamentoInicial: 72,
    expectativa: "Estrear com solidez",
    objetivo: "Marcar ao menos 3 pontos na temporada",
    reputacao: 52,
    pilotos: ["driver_valtteri_bottas", "driver_sergio_p_rez"],
    estimado: true,
  },
];

const A = (
  velocidade: number,
  consistencia: number,
  gestaoPneus: number,
  ultrapassagem: number,
  defesa: number,
  chuva: number,
  experiencia: number,
  agressividade: number,
): DriverAttributes => ({ velocidade, consistencia, gestaoPneus, ultrapassagem, defesa, chuva, experiencia, agressividade });

export const DRIVERS_2026: DriverData[] = [
  { id: "driver_lando_norris", nome: "Lando Norris", primeiroNome: "Lando", sobrenome: "Norris", codigo: "NOR", numero: 1, nacionalidade: "Reino Unido", equipeId: "team_mclaren", atributos: A(94, 90, 88, 91, 88, 93, 78, 72), salario: 1.3, contratoEtapas: 3, estimado: true },
  { id: "driver_oscar_piastri", nome: "Oscar Piastri", primeiroNome: "Oscar", sobrenome: "Piastri", codigo: "PIA", numero: 81, nacionalidade: "Austrália", equipeId: "team_mclaren", atributos: A(92, 91, 89, 88, 87, 90, 74, 78), salario: 1.0, contratoEtapas: 3, estimado: true },
  { id: "driver_george_russell", nome: "George Russell", primeiroNome: "George", sobrenome: "Russell", codigo: "RUS", numero: 63, nacionalidade: "Reino Unido", equipeId: "team_mercedes", atributos: A(92, 89, 88, 89, 88, 88, 84, 74), salario: 1.1, contratoEtapas: 3, estimado: true },
  { id: "driver_kimi_antonelli", nome: "Kimi Antonelli", primeiroNome: "Kimi", sobrenome: "Antonelli", codigo: "ANT", numero: 12, nacionalidade: "Itália", equipeId: "team_mercedes", atributos: A(84, 76, 79, 85, 77, 80, 56, 78), salario: 0.5, contratoEtapas: 3, estimado: true },
  { id: "driver_max_verstappen", nome: "Max Verstappen", primeiroNome: "Max", sobrenome: "Verstappen", codigo: "VER", numero: 3, nacionalidade: "Países Baixos", equipeId: "team_red_bull", atributos: A(97, 94, 93, 96, 94, 96, 93, 86), salario: 1.5, contratoEtapas: 3, estimado: true },
  { id: "driver_isack_hadjar", nome: "Isack Hadjar", primeiroNome: "Isack", sobrenome: "Hadjar", codigo: "HAD", numero: 6, nacionalidade: "França", equipeId: "team_red_bull", atributos: A(82, 78, 79, 83, 78, 80, 58, 80), salario: 0.45, contratoEtapas: 3, estimado: true },
  { id: "driver_charles_leclerc", nome: "Charles Leclerc", primeiroNome: "Charles", sobrenome: "Leclerc", codigo: "LEC", numero: 16, nacionalidade: "Mônaco", equipeId: "team_ferrari", atributos: A(94, 85, 87, 92, 84, 85, 85, 82), salario: 1.3, contratoEtapas: 3, estimado: true },
  { id: "driver_lewis_hamilton", nome: "Lewis Hamilton", primeiroNome: "Lewis", sobrenome: "Hamilton", codigo: "HAM", numero: 44, nacionalidade: "Reino Unido", equipeId: "team_ferrari", atributos: A(92, 88, 90, 93, 89, 94, 99, 72), salario: 1.4, contratoEtapas: 3, estimado: true },
  { id: "driver_alexander_albon", nome: "Alexander Albon", primeiroNome: "Alexander", sobrenome: "Albon", codigo: "ALB", numero: 23, nacionalidade: "Tailândia", equipeId: "team_williams", atributos: A(87, 86, 85, 86, 87, 84, 76, 70), salario: 0.65, contratoEtapas: 3, estimado: true },
  { id: "driver_carlos_sainz", nome: "Carlos Sainz", primeiroNome: "Carlos", sobrenome: "Sainz", codigo: "SAI", numero: 55, nacionalidade: "Espanha", equipeId: "team_williams", atributos: A(88, 89, 88, 85, 88, 85, 86, 72), salario: 0.8, contratoEtapas: 3, estimado: true },
  { id: "driver_liam_lawson", nome: "Liam Lawson", primeiroNome: "Liam", sobrenome: "Lawson", codigo: "LAW", numero: 30, nacionalidade: "Nova Zelândia", equipeId: "team_racing_bulls", atributos: A(84, 80, 80, 85, 81, 82, 63, 82), salario: 0.4, contratoEtapas: 3, estimado: true },
  { id: "driver_arvid_lindblad", nome: "Arvid Lindblad", primeiroNome: "Arvid", sobrenome: "Lindblad", codigo: "LIN", numero: 41, nacionalidade: "Reino Unido", equipeId: "team_racing_bulls", atributos: A(78, 74, 75, 79, 74, 75, 45, 80), salario: 0.25, contratoEtapas: 3, estimado: true },
  { id: "driver_fernando_alonso", nome: "Fernando Alonso", primeiroNome: "Fernando", sobrenome: "Alonso", codigo: "ALO", numero: 14, nacionalidade: "Espanha", equipeId: "team_aston_martin", atributos: A(88, 90, 92, 87, 92, 93, 100, 68), salario: 1.0, contratoEtapas: 3, estimado: true },
  { id: "driver_lance_stroll", nome: "Lance Stroll", primeiroNome: "Lance", sobrenome: "Stroll", codigo: "STR", numero: 18, nacionalidade: "Canadá", equipeId: "team_aston_martin", atributos: A(78, 76, 77, 76, 74, 79, 76, 64), salario: 0.6, contratoEtapas: 3, estimado: true },
  { id: "driver_esteban_ocon", nome: "Esteban Ocon", primeiroNome: "Esteban", sobrenome: "Ocon", codigo: "OCO", numero: 31, nacionalidade: "França", equipeId: "team_haas", atributos: A(85, 82, 83, 84, 85, 82, 79, 74), salario: 0.45, contratoEtapas: 3, estimado: true },
  { id: "driver_oliver_bearman", nome: "Oliver Bearman", primeiroNome: "Oliver", sobrenome: "Bearman", codigo: "BEA", numero: 87, nacionalidade: "Reino Unido", equipeId: "team_haas", atributos: A(82, 78, 79, 82, 78, 80, 55, 80), salario: 0.3, contratoEtapas: 3, estimado: true },
  { id: "driver_nico_hulkenberg", nome: "Nico Hülkenberg", primeiroNome: "Nico", sobrenome: "Hülkenberg", codigo: "HUL", numero: 27, nacionalidade: "Alemanha", equipeId: "team_audi", atributos: A(86, 87, 85, 83, 86, 86, 93, 69), salario: 0.55, contratoEtapas: 3, estimado: true },
  { id: "driver_gabriel_bortoleto", nome: "Gabriel Bortoleto", primeiroNome: "Gabriel", sobrenome: "Bortoleto", codigo: "BOR", numero: 5, nacionalidade: "Brasil", equipeId: "team_audi", atributos: A(81, 77, 78, 82, 76, 78, 54, 76), salario: 0.3, contratoEtapas: 3, estimado: true },
  { id: "driver_pierre_gasly", nome: "Pierre Gasly", primeiroNome: "Pierre", sobrenome: "Gasly", codigo: "GAS", numero: 10, nacionalidade: "França", equipeId: "team_alpine", atributos: A(85, 83, 84, 84, 83, 84, 83, 75), salario: 0.5, contratoEtapas: 3, estimado: true },
  { id: "driver_franco_colapinto", nome: "Franco Colapinto", primeiroNome: "Franco", sobrenome: "Colapinto", codigo: "COL", numero: 43, nacionalidade: "Argentina", equipeId: "team_alpine", atributos: A(80, 75, 76, 81, 75, 77, 52, 83), salario: 0.25, contratoEtapas: 3, estimado: true },
  { id: "driver_valtteri_bottas", nome: "Valtteri Bottas", primeiroNome: "Valtteri", sobrenome: "Bottas", codigo: "BOT", numero: 77, nacionalidade: "Finlândia", equipeId: "team_cadillac", atributos: A(83, 86, 85, 80, 84, 84, 94, 58), salario: 0.6, contratoEtapas: 3, estimado: true },
  { id: "driver_sergio_p_rez", nome: "Sergio Pérez", primeiroNome: "Sergio", sobrenome: "Pérez", codigo: "PER", numero: 11, nacionalidade: "México", equipeId: "team_cadillac", atributos: A(84, 83, 88, 81, 85, 86, 96, 66), salario: 0.7, contratoEtapas: 3, estimado: true },
];

export type TrackKey = "melbourne" | "shanghai" | "suzuka";

export interface CircuitData {
  id: string;
  trackKey: TrackKey;
  nome: string;
  gp: string;
  cidade: string;
  pais: string;
  bandeira: string;
  comprimentoM: number;
  voltas: number;
  voltasSprint: number;
  voltasQuali: number;
  curvas: number;
  baseLapTime: number;
  abrasividade: number;
  dificuldadeUltrapassagem: number;
  pitLoss: number;
  downforceIdeal: number; // 0 baixo, 1 alto
  chanceChuva: number;
  sprint: boolean;
  data: string;
  pontosForca: string;
  descricao: string;
}

export const CIRCUITS_2026: CircuitData[] = [
  {
    id: "circuit_melbourne",
    trackKey: "melbourne",
    nome: "Albert Park Circuit",
    gp: "GP da Austrália",
    cidade: "Melbourne",
    pais: "Austrália",
    bandeira: "🇦🇺",
    comprimentoM: 5278,
    voltas: 58,
    voltasSprint: 19,
    voltasQuali: 1,
    curvas: 14,
    baseLapTime: 80.5,
    abrasividade: 0.55,
    dificuldadeUltrapassagem: 0.55,
    pitLoss: 21.5,
    downforceIdeal: 0.55,
    chanceChuva: 0.28,
    sprint: false,
    data: "08/03/2026",
    pontosForca: "Tração e estabilidade em frenagem",
    descricao: "Circuito semi-urbano rápido, com retas longas e zebras agressivas.",
  },
  {
    id: "circuit_shanghai",
    trackKey: "shanghai",
    nome: "Shanghai International Circuit",
    gp: "GP da China",
    cidade: "Xangai",
    pais: "China",
    bandeira: "🇨🇳",
    comprimentoM: 5451,
    voltas: 56,
    voltasSprint: 19,
    voltasQuali: 1,
    curvas: 16,
    baseLapTime: 94.2,
    abrasividade: 0.62,
    dificuldadeUltrapassagem: 0.72,
    pitLoss: 22.0,
    downforceIdeal: 0.5,
    chanceChuva: 0.22,
    sprint: true,
    data: "15/03/2026",
    pontosForca: "Velocidade de reta e eficiência energética",
    descricao: "A espiral e a longa reta oposta criam oportunidades reais de ultrapassagem.",
  },
  {
    id: "circuit_suzuka",
    trackKey: "suzuka",
    nome: "Suzuka International Racing Course",
    gp: "GP do Japão",
    cidade: "Suzuka",
    pais: "Japão",
    bandeira: "🇯🇵",
    comprimentoM: 5807,
    voltas: 53,
    voltasSprint: 19,
    voltasQuali: 1,
    curvas: 18,
    baseLapTime: 91.8,
    abrasividade: 0.68,
    dificuldadeUltrapassagem: 0.38,
    pitLoss: 22.5,
    downforceIdeal: 0.78,
    chanceChuva: 0.32,
    sprint: false,
    data: "29/03/2026",
    pontosForca: "Carga aerodinâmica e ritmo nas curvas rápidas",
    descricao: "Traçado em oito, muito técnico, onde a confiança do piloto faz diferença.",
  },
];

export const POINTS_RACE = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
export const POINTS_SPRINT = [8, 7, 6, 5, 4, 3, 2, 1];

export interface SponsorOffer {
  id: string;
  nome: string;
  setor: string;
  assinatura: number;
  porEtapa: number;
  bonusObjetivo: number;
  objetivo: string;
  metaPosicao: number; // concluir etapa até esta posição para bônus
  reputacaoMinima: number;
}

export const SPONSOR_OFFERS: SponsorOffer[] = [
  { id: "sponsor_apex", nome: "Apex Energy", setor: "Energia", assinatura: 3.0, porEtapa: 1.8, bonusObjetivo: 4.0, objetivo: "Terminar uma etapa no top 5", metaPosicao: 5, reputacaoMinima: 55 },
  { id: "sponsor_nova", nome: "Nova Bank", setor: "Serviços financeiros", assinatura: 5.0, porEtapa: 1.2, bonusObjetivo: 3.0, objetivo: "Terminar uma etapa no top 10", metaPosicao: 10, reputacaoMinima: 40 },
  { id: "sponsor_voltic", nome: "Voltic Mobility", setor: "Mobilidade elétrica", assinatura: 2.2, porEtapa: 2.4, bonusObjetivo: 2.5, objetivo: "Terminar uma etapa no top 8", metaPosicao: 8, reputacaoMinima: 65 },
  { id: "sponsor_titan", nome: "Titan Lubrificantes", setor: "Indústria", assinatura: 4.0, porEtapa: 0.9, bonusObjetivo: 5.0, objetivo: "Terminar uma etapa no pódio", metaPosicao: 3, reputacaoMinima: 75 },
];

export type StaffRole = "engenheiro_chefe" | "aerodinamicista" | "estrategista";

export interface StaffCandidate {
  id: string;
  nome: string;
  funcao: StaffRole;
  rating: number;
  salario: number;
  contratacao: number;
}

export const STAFF_MARKET: StaffCandidate[] = [
  { id: "staff_1", nome: "Helena Duarte", funcao: "engenheiro_chefe", rating: 88, salario: 0.9, contratacao: 4.0 },
  { id: "staff_2", nome: "Rafael Kodama", funcao: "engenheiro_chefe", rating: 79, salario: 0.55, contratacao: 2.0 },
  { id: "staff_3", nome: "Marta Voss", funcao: "engenheiro_chefe", rating: 72, salario: 0.35, contratacao: 1.0 },
  { id: "staff_4", nome: "Idris Bello", funcao: "aerodinamicista", rating: 90, salario: 0.85, contratacao: 4.5 },
  { id: "staff_5", nome: "Sofia Marchetti", funcao: "aerodinamicista", rating: 81, salario: 0.5, contratacao: 2.5 },
  { id: "staff_6", nome: "Peter Lang", funcao: "aerodinamicista", rating: 73, salario: 0.32, contratacao: 1.0 },
  { id: "staff_7", nome: "Aiko Tanaka", funcao: "estrategista", rating: 91, salario: 0.8, contratacao: 4.0 },
  { id: "staff_8", nome: "Luis Ferreira", funcao: "estrategista", rating: 80, salario: 0.48, contratacao: 2.2 },
  { id: "staff_9", nome: "Jonas Weber", funcao: "estrategista", rating: 71, salario: 0.3, contratacao: 0.8 },
];

export const TEAM_BY_ID = Object.fromEntries(TEAMS_2026.map((t) => [t.id, t]));
export const DRIVER_BY_ID = Object.fromEntries(DRIVERS_2026.map((d) => [d.id, d]));
export const CIRCUIT_BY_ID = Object.fromEntries(CIRCUITS_2026.map((c) => [c.id, c]));

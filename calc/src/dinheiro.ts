/**
 * Dinheiro em centavos inteiros. Nada de ponto flutuante nos cálculos.
 */

export type Centavos = number;

/**
 * Arredonda (quantidade × centavos ÷ divisor) para o centavo mais próximo,
 * meio para cima (half-up), aplicado sobre o produto total.
 * Ex.: 3 × 163953 ÷ 30 = 16395,3 → 16395 (R$ 163,95), e não 3 × 5465.
 *
 * `quantidade` pode ser fracionária em meios (ex.: 2,5 dias de recesso);
 * multiplicamos por 2 para manter tudo inteiro.
 */
export function multiplicarArredondado(quantidade: number, centavos: Centavos, divisor = 1): Centavos {
  if (!Number.isInteger(centavos) || centavos < 0) throw new RangeError(`Centavos inválidos: ${centavos}`);
  if (!Number.isInteger(divisor) || divisor <= 0) throw new RangeError(`Divisor inválido: ${divisor}`);
  const q2 = quantidade * 2;
  if (!Number.isInteger(q2) || quantidade < 0) throw new RangeError(`Quantidade inválida: ${quantidade}`);
  const numerador = q2 * centavos; // = 2 × quantidade × centavos
  const denominador = 2 * divisor;
  // half-up para valores não negativos: floor((n + d/2) / d), com n e d já dobrados
  return Math.floor((numerador + divisor) / denominador);
}

/** Converte texto "1639.53" / "1.639,53" / número em centavos, exigindo no máximo 2 casas. */
export function paraCentavos(valor: string | number): Centavos {
  let texto = typeof valor === "number" ? valor.toFixed(2) : valor.trim();
  if (texto.includes(",")) texto = texto.replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(texto)) throw new RangeError(`Valor monetário inválido: ${valor}`);
  const [inteiro, frac = ""] = texto.split(".");
  return Number(inteiro) * 100 + Number(frac.padEnd(2, "0"));
}

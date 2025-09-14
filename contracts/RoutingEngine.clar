(define-trait ownable-trait
  (
    (get-owner () (response principal uint))
    (transfer-ownership (principal) (response bool uint))
  )
)

(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-NO-PREDICTION u101)
(define-constant ERR-INVALID-PATH u102)
(define-constant ERR-INVALID-FEE u103)
(define-constant ERR-INVALID-TOLERANCE u104)
(define-constant ERR-INVALID-PATH-LIST u105)
(define-constant ERR-PATH-NOT-REGISTERED u106)
(define-constant ERR-INVALID-RISK-LEVEL u107)
(define-constant ERR-INVALID-TIME-ESTIMATE u108)
(define-constant ERR-NO-VALID-PATHS u109)
(define-constant ERR-INVALID-UPDATE-PARAM u110)
(define-constant ERR-UPDATE-NOT-ALLOWED u111)
(define-constant ERR-MAX-PATHS-EXCEEDED u112)
(define-constant ERR-INVALID-PRIORITY u113)
(define-constant ERR-INVALID-WEIGHT u114)
(define-constant ERR-ORACLE-NOT-SET u115)
(define-constant ERR-INVALID-OWNER u116)
(define-constant ERR-HISTORY-ALREADY-EXISTS u117)
(define-constant ERR-HISTORY-NOT-FOUND u118)
(define-constant ERR-INVALID-HISTORY-ID u119)
(define-constant ERR-INVALID-STATUS u120)

(define-data-var owner principal tx-sender)
(define-data-var oracle-contract principal 'SP000000000000000000002Q6VF78)
(define-data-var max-paths uint u50)
(define-data-var selection-fee uint u500)
(define-data-var next-history-id uint u0)
(define-data-var fallback-path uint u0)
(define-data-var fee-tolerance uint u10)
(define-data-var risk-threshold uint u20)
(define-data-var time-threshold uint u3600)

(define-map path-predictions
  uint
  {
    fee: uint,
    risk-level: uint,
    time-estimate: uint,
    timestamp: uint,
    priority: uint
  }
)

(define-map selection-history
  uint
  {
    selected-path: uint,
    actual-fee: uint,
    user: principal,
    timestamp: uint,
    status: bool
  }
)

(define-map path-weights
  uint
  {
    fee-weight: uint,
    risk-weight: uint,
    time-weight: uint
  }
)

(define-map path-status uint bool)

(define-read-only (get-owner)
  (ok (var-get owner))
)

(define-read-only (get-prediction (path-id uint))
  (map-get? path-predictions path-id)
)

(define-read-only (get-history (history-id uint))
  (map-get? selection-history history-id)
)

(define-read-only (get-path-weight (path-id uint))
  (map-get? path-weights path-id)
)

(define-read-only (is-path-active (path-id uint))
  (default-to false (map-get? path-status path-id))
)

(define-private (validate-fee (fee uint))
  (if (> fee u0)
    (ok true)
    (err ERR-INVALID-FEE)
  )
)

(define-private (validate-risk-level (risk uint))
  (if (<= risk u100)
    (ok true)
    (err ERR-INVALID-RISK-LEVEL)
  )
)

(define-private (validate-time-estimate (time uint))
  (if (> time u0)
    (ok true)
    (err ERR-INVALID-TIME-ESTIMATE)
  )
)

(define-private (validate-priority (priority uint))
  (if (<= priority u10)
    (ok true)
    (err ERR-INVALID-PRIORITY)
  )
)

(define-private (validate-weight (weight uint))
  (if (and (> weight u0) (<= weight u100))
    (ok true)
    (err ERR-INVALID-WEIGHT)
  )
)

(define-private (validate-path-id (path-id uint))
  (if (is-path-active path-id)
    (ok true)
    (err ERR-PATH-NOT-REGISTERED)
  )
)

(define-private (validate-path-list (path-ids (list 20 uint)))
  (if (and (> (len path-ids) u0) (<= (len path-ids) u20))
    (ok true)
    (err ERR-INVALID-PATH-LIST)
  )
)

(define-private (validate-tolerance (tolerance uint))
  (if (<= tolerance u50)
    (ok true)
    (err ERR-INVALID-TOLERANCE)
  )
)

(define-private (validate-owner (caller principal))
  (if (is-eq caller (var-get owner))
    (ok true)
    (err ERR-NOT-AUTHORIZED)
  )
)

(define-private (validate-oracle-set)
  (if (not (is-eq (var-get oracle-contract) 'SP000000000000000000002Q6VF78))
    (ok true)
    (err ERR-ORACLE-NOT-SET)
  )
)

(define-private (validate-status (status bool))
  (ok true)
)

(define-private (calculate-score (prediction { fee: uint, risk-level: uint, time-estimate: uint, priority: uint }) (weights { fee-weight: uint, risk-weight: uint, time-weight: uint }))
  (let (
    (fee-score (/ (* (get fee prediction) (get fee-weight weights)) u100))
    (risk-score (/ (* (get risk-level prediction) (get risk-weight weights)) u100))
    (time-score (/ (* (get time-estimate prediction) (get time-weight weights)) u100))
    (priority-boost (* (get priority prediction) u10))
  )
    (+ fee-score risk-score time-score priority-boost)
  )
)

(define-private (find-best-path (path-id uint) (acc { best-path: uint, best-score: uint }))
  (let (
    (prediction-opt (get-prediction path-id))
    (weights-opt (get-path-weight path-id))
  )
    (match prediction-opt
      prediction
      (match weights-opt
        weights
        (let ((score (calculate-score prediction weights)))
          (if (< score (get best-score acc))
            { best-path: path-id, best-score: score }
            acc
          )
        )
        acc
      )
      acc
    )
  )
)

(define-public (select-best-path (path-ids (list 20 uint)))
  (begin
    (try! (validate-path-list path-ids))
    (try! (validate-oracle-set))
    (fold find-best-path path-ids { best-path: (var-get fallback-path), best-score: u999999999 })
  )
)

(define-public (update-prediction (path-id uint) (fee uint) (risk-level uint) (time-estimate uint) (priority uint))
  (begin
    (try! (validate-owner tx-sender))
    (try! (validate-path-id path-id))
    (try! (validate-fee fee))
    (try! (validate-risk-level risk-level))
    (try! (validate-time-estimate time-estimate))
    (try! (validate-priority priority))
    (map-set path-predictions path-id { fee: fee, risk-level: risk-level, time-estimate: time-estimate, timestamp: block-height, priority: priority })
    (print { event: "prediction-updated", path-id: path-id })
    (ok true)
  )
)

(define-public (set-path-weight (path-id uint) (fee-weight uint) (risk-weight uint) (time-weight uint))
  (begin
    (try! (validate-owner tx-sender))
    (try! (validate-path-id path-id))
    (try! (validate-weight fee-weight))
    (try! (validate-weight risk-weight))
    (try! (validate-weight time-weight))
    (map-set path-weights path-id { fee-weight: fee-weight, risk-weight: risk-weight, time-weight: time-weight })
    (print { event: "weight-updated", path-id: path-id })
    (ok true)
  )
)

(define-public (register-path (path-id uint))
  (begin
    (try! (validate-owner tx-sender))
    (asserts! (not (is-path-active path-id)) (err ERR-PATH-NOT-REGISTERED))
    (asserts! (< path-id (var-get max-paths)) (err ERR-MAX-PATHS-EXCEEDED))
    (map-set path-status path-id true)
    (print { event: "path-registered", path-id: path-id })
    (ok true)
  )
)

(define-public (deactivate-path (path-id uint))
  (begin
    (try! (validate-owner tx-sender))
    (try! (validate-path-id path-id))
    (map-set path-status path-id false)
    (print { event: "path-deactivated", path-id: path-id })
    (ok true)
  )
)

(define-public (log-selection (selected-path uint) (actual-fee uint) (status bool))
  (let ((history-id (var-get next-history-id)))
    (try! (validate-path-id selected-path))
    (try! (validate-fee actual-fee))
    (try! (validate-status status))
    (map-set selection-history history-id { selected-path: selected-path, actual-fee: actual-fee, user: tx-sender, timestamp: block-height, status: status })
    (var-set next-history-id (+ history-id u1))
    (print { event: "selection-logged", history-id: history-id })
    (ok history-id)
  )
)

(define-public (update-fallback-path (new-path uint))
  (begin
    (try! (validate-owner tx-sender))
    (try! (validate-path-id new-path))
    (var-set fallback-path new-path)
    (print { event: "fallback-updated", path: new-path })
    (ok true)
  )
)

(define-public (set-fee-tolerance (new-tolerance uint))
  (begin
    (try! (validate-owner tx-sender))
    (try! (validate-tolerance new-tolerance))
    (var-set fee-tolerance new-tolerance)
    (print { event: "tolerance-updated", tolerance: new-tolerance })
    (ok true)
  )
)

(define-public (set-risk-threshold (new-threshold uint))
  (begin
    (try! (validate-owner tx-sender))
    (try! (validate-risk-level new-threshold))
    (var-set risk-threshold new-threshold)
    (print { event: "risk-threshold-updated", threshold: new-threshold })
    (ok true)
  )
)

(define-public (set-time-threshold (new-threshold uint))
  (begin
    (try! (validate-owner tx-sender))
    (try! (validate-time-estimate new-threshold))
    (var-set time-threshold new-threshold)
    (print { event: "time-threshold-updated", threshold: new-threshold })
    (ok true)
  )
)

(define-public (set-max-paths (new-max uint))
  (begin
    (try! (validate-owner tx-sender))
    (asserts! (> new-max u0) (err ERR-INVALID-UPDATE-PARAM))
    (var-set max-paths new-max)
    (print { event: "max-paths-updated", max: new-max })
    (ok true)
  )
)

(define-public (set-selection-fee (new-fee uint))
  (begin
    (try! (validate-owner tx-sender))
    (try! (validate-fee new-fee))
    (var-set selection-fee new-fee)
    (print { event: "selection-fee-updated", fee: new-fee })
    (ok true)
  )
)

(define-public (set-oracle-contract (new-oracle principal))
  (begin
    (try! (validate-owner tx-sender))
    (asserts! (not (is-eq new-oracle 'SP000000000000000000002Q6VF78)) (err ERR-INVALID-UPDATE-PARAM))
    (var-set oracle-contract new-oracle)
    (print { event: "oracle-updated", oracle: new-oracle })
    (ok true)
  )
)

(define-public (transfer-ownership (new-owner principal))
  (begin
    (try! (validate-owner tx-sender))
    (asserts! (not (is-eq new-owner tx-sender)) (err ERR-INVALID-OWNER))
    (var-set owner new-owner)
    (print { event: "ownership-transferred", new-owner: new-owner })
    (ok true)
  )
)

(define-read-only (get-best-path (path-ids (list 20 uint)))
  (let ((selection (select-best-path path-ids)))
    (if (is-eq (get best-path selection) (var-get fallback-path))
      (err ERR-NO-VALID-PATHS)
      (ok (get best-path selection))
    )
  )
)

(define-read-only (get-history-count)
  (ok (var-get next-history-id))
)

(define-read-only (get-fallback-path)
  (ok (var-get fallback-path))
)

(define-read-only (get-fee-tolerance)
  (ok (var-get fee-tolerance))
)

(define-read-only (get-risk-threshold)
  (ok (var-get risk-threshold))
)

(define-read-only (get-time-threshold)
  (ok (var-get time-threshold))
)

(define-read-only (get-max-paths)
  (ok (var-get max-paths))
)

(define-read-only (get-selection-fee)
  (ok (var-get selection-fee))
)

(define-read-only (get-oracle-contract)
  (ok (var-get oracle-contract))
)